import type { Provider } from "../types";

export const openrouter: Provider = {
	id: "openrouter",
	name: "OpenRouter",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
