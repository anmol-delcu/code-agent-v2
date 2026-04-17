// Make sure to replace the values with your actual API key and model

// USING ANTHROPIC CLAUDE SONNET 4 is strongly recommended for best results

export const config = {
  aiSdk: {
    // The base URL for the AI SDK, leave blank for e.g. openai
    baseUrl: process.env.AI_BASE_URL || "https://api.anthropic.com/v1",

    // Set AI_API_KEY in your .env file (never commit the real key)
    apiKey: process.env.AI_API_KEY || "",

    // The model to use, e.g., "gpt-4", "gpt-3.5-turbo", or "ollama/llama2"
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
  },
} as const;
