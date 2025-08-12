import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { factCheckZ } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 second timeout for web

// Simple in-memory rate limiting (use Redis in production)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimit.get(ip) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(ip, recentRequests);
  return true;
}

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 45000 // 45 second timeout
});

export async function POST(req, { headers }) {
  try {
    // Rate limiting
    const forwarded = headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a minute." },
        { status: 429 }
      );
    }

    const { image } = await req.json();
    
    // Enhanced input validation
    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    if (!image.startsWith("data:image")) {
      return NextResponse.json(
        { error: "Invalid image format. Please provide a valid data URL." },
        { status: 400 }
      );
    }

    // Check image size (base64 data URL)
    const base64Data = image.split(',')[1];
    const imageSize = Math.ceil((base64Data.length * 3) / 4);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (imageSize > maxSize) {
      return NextResponse.json(
        { error: "Image too large. Please use an image under 10MB." },
        { status: 400 }
      );
    }

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

    // Validate with Zod schema
    const validated = factCheckZ.parse(parsed);
    
    // Add metadata for web
    const resultWithMetadata = {
      ...validated,
      analyzedAt: new Date().toISOString(),
      model: model,
      processingTime: Date.now() - Date.now(), // Will be calculated properly
    };

    return NextResponse.json(resultWithMetadata);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Invalid response format from AI service",
        details: err.flatten() 
      }, { status: 422 });
    }
    
    console.error("/api/analyze error", err);
    
    // Better error messages for web users
    if (err.code === 'insufficient_quota') {
      return NextResponse.json({ 
        error: "Service temporarily unavailable. Please try again later." 
      }, { status: 503 });
    }
    
    if (err.code === 'rate_limit_exceeded') {
      return NextResponse.json({ 
        error: "Service is busy. Please try again in a few minutes." 
      }, { status: 429 });
    }
    
    return NextResponse.json({ 
      error: "Analysis failed. Please try again or contact support if the problem persists." 
    }, { status: 500 });
  }
}
