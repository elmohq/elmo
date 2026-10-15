import { describe, expect, it } from "vitest";
import { entityText } from "./judge";

const entity = { name: "Acme", aliases: ["Acme Corp", "ACME Inc"], domains: ["acme.com"], competitors: ["Globex"] };

describe("entityText", () => {
	it("lays the entity out as the model was trained on", () => {
		expect(entityText(entity)).toBe("Acme | aka Acme Corp, ACME Inc | site acme.com | competitors Globex");
	});

	it("keeps the name and drops what doesn't fit, so the passage keeps its room", () => {
		expect(entityText(entity, (text) => text.length <= 20)).toBe("Acme | aka Acme Corp");
		expect(entityText(entity, () => false)).toBe("Acme");
	});
});
