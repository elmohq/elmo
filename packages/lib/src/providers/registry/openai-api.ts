import type { Provider } from "../types";

export const openaiApi: Provider = {
	id: "openai-api",
	name: "OpenAI API",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
