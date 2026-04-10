import type { Provider } from "./types";

export const dataforseo: Provider = {
	id: "dataforseo",
	name: "DataForSEO",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
