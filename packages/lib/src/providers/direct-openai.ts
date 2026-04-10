import type { Provider } from "./types";

export const directOpenai: Provider = {
	id: "direct-openai",
	name: "Direct OpenAI",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
