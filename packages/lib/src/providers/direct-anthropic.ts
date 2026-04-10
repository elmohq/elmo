import type { Provider } from "./types";

export const directAnthropic: Provider = {
	id: "direct-anthropic",
	name: "Direct Anthropic",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
