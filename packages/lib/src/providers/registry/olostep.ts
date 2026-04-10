import type { Provider } from "../types";

export const olostep: Provider = {
	id: "olostep",
	name: "Olostep",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
