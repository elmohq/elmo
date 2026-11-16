import { describe, expect, it } from "vitest";
import { externalRel } from "@/lib/external-link";

describe("externalRel", () => {
	it("keeps the Referer for links to our own domains and their subdomains", () => {
		expect(externalRel("https://elmohq.com")).toBe("noopener");
		expect(externalRel("https://www.elmohq.com/pricing")).toBe("noopener");
		expect(externalRel("https://demo.elmohq.com/app")).toBe("noopener");
		expect(externalRel("https://bluewhale.dev")).toBe("noopener");
		expect(externalRel("https://jrhizor.dev/x")).toBe("noopener");
	});

	it("keeps the Referer regardless of scheme, port, or case", () => {
		expect(externalRel("http://elmohq.com")).toBe("noopener");
		expect(externalRel("https://elmohq.com:8443/x")).toBe("noopener");
		expect(externalRel("https://ELMOHQ.com")).toBe("noopener");
	});

	it("isolates every other host, even when our domains appear in the path or query", () => {
		expect(externalRel("https://github.com/elmohq/elmo")).toBe("noopener noreferrer");
		expect(externalRel("https://example.com/?ref=elmohq.com")).toBe("noopener noreferrer");
	});

	it("isolates lookalike domains", () => {
		expect(externalRel("https://notelmohq.com")).toBe("noopener noreferrer");
		expect(externalRel("https://elmohq.com.example.com")).toBe("noopener noreferrer");
	});

	it("isolates values that are not full URLs instead of throwing", () => {
		expect(() => externalRel("/docs")).not.toThrow();
		expect(() => externalRel("")).not.toThrow();
		expect(() => externalRel("not a url")).not.toThrow();
		expect(() => externalRel("mailto:hello@elmohq.com")).not.toThrow();

		expect(externalRel("/docs")).toBe("noopener noreferrer");
		expect(externalRel("")).toBe("noopener noreferrer");
		expect(externalRel("not a url")).toBe("noopener noreferrer");
		expect(externalRel("mailto:hello@elmohq.com")).toBe("noopener noreferrer");
	});
});
