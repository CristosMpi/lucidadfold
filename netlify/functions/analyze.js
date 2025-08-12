const OpenAI = require('openai');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const { image } = JSON.parse(event.body);
    
    // Validate input
    if (!image || typeof image !== "string") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Image data is required" }),
      };
    }

    if (!image.startsWith("data:image")) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid image format. Please provide a valid data URL." }),
      };
    }

    // Check image size (base64 data URL)
    const base64Data = image.split(',')[1];
    const imageSize = Math.ceil((base64Data.length * 3) / 4);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (imageSize > maxSize) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Image too large. Please use an image under 10MB." }),
      };
    }

    // Initialize OpenAI client
    const client = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 45000
    });

    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

    const instructions = `You are LucidAd, an advertising claim fact-checker. Analyze the advertisement image and return concise, source-linked JSON per the schema. 

Steps:
1) Identify ad name/company
2) Virtually enhance (brightness/contrast/sharpness), denoise, deskew and run OCR
3) Focus on relevant ad area
4) Extract text, isolate factual claims
5) Briefly infer context
6) Rephrase main claim(s) as fact-checkable statements
7) Extract product, company, key numbers, measurable facts
8) Categorize claim type
9) Optionally map to date/region/model
10) Verify claim(s)
11) Assign 0–100 truth probability
12) ~2 sentence summary
13) Provide 2–5 credible source links

Be thorough but concise. Focus on verifiable claims and provide authoritative sources.`;

    const FactCheckSchemaForAPI = {
      name: "fact_check_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          productName: { type: ["string", "null"] },
          company: { type: ["string", "null"] },
          keyNumbers: { type: "array", items: { type: "string" } },
          measurableFacts: { type: "array", items: { type: "string" } },
          category: { type: ["string", "null"] },
          briefContext: { type: ["string", "null"] },
          truthScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
          report: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: ["string", "null"] },
                url: { type: "string" },
              },
              required: ["url"],
            },
          },
        },
        required: [
          "productName",
          "company",
          "keyNumbers",
          "measurableFacts",
          "category",
          "briefContext",
          "truthScore",
          "report",
          "sources",
        ],
      },
      strict: true,
    };

    const response = await client.responses.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: FactCheckSchemaForAPI },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instructions },
            { type: "input_image", image_url: image },
          ],
        },
      ],
      max_output_tokens: 900,
    });

    const jsonText = response.output_text;
    const parsed = JSON.parse(jsonText);
    
    // Add metadata for web
    const resultWithMetadata = {
      ...parsed,
      analyzedAt: new Date().toISOString(),
      model: model,
      processingTime: Date.now() - Date.now(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(resultWithMetadata),
    };

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }),
      };
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: "Service is busy. Please try again in a few minutes." }),
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Analysis failed. Please try again or contact support if the problem persists." 
      }),
    };
  }
};
