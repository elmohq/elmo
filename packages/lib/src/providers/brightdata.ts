import type { Provider } from "./types";

export const brightdata: Provider = {
	id: "brightdata",
	name: "BrightData",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
