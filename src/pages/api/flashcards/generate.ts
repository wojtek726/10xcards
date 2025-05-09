import { z } from "zod";
import type { APIRoute } from "astro";
import { AIService } from "../../../lib/services/ai.service";
import { OpenRouterError } from "../../../types";
import { logger } from '../../../lib/services/logger.service';

// Schema for request validation
const generateFlashcardSchema = z.object({
  input_text: z.string().min(1, "Input text is required").max(1000, "Input text is too long"),
});

// Create a singleton instance of AIService
const aiService = new AIService();

// Disable prerendering for dynamic API route
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Validate Content-Type
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(
        JSON.stringify({
          error: "Invalid Content-Type",
          message: "Content-Type must be application/json",
        }),
        { status: 415, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Check content length
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1024 * 10) {
      // 10KB limit
      return new Response(
        JSON.stringify({
          error: "Request too large",
          message: "Request body exceeds maximum allowed size",
        }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request body
    const body = await request.json();

    // 4. Validate request data
    const validationResult = generateFlashcardSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid input",
          details: validationResult.error.errors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Generate flashcard using AI service
    const { input_text } = validationResult.data;
    try {
      const response = await aiService.generateFlashcard(input_text);
      return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      if (error instanceof OpenRouterError) {
        if (error.statusCode === 429) {
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded",
              message: "Too many requests. Please try again later.",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        if (error.statusCode === 504 || error.code === "TIMEOUT_ERROR") {
          return new Response(
            JSON.stringify({
              error: "Gateway Timeout",
              message: "AI service took too long to respond. Please try again.",
            }),
            { status: 504, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      throw error; // Re-throw other errors to be caught by global handler
    }
  } catch (error) {
    logger.error("Error generating flashcard:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Failed to generate flashcard",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
