export const config = {
  aiSdk: {
    baseUrl: process.env.AI_BASE_URL || "https://api.anthropic.com/v1",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
  },
} as const;
