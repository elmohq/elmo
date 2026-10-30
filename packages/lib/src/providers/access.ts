/**
 * Providers that call a model's API directly rather than scraping its consumer product. Kept apart from the
 * registry so code that only filters on it, such as the browser's analytics, doesn't load every provider's client.
 */
export const API_PROVIDER_IDS: readonly string[] = ["anthropic-api", "mistral-api", "openai-api", "openrouter", "stub"];
