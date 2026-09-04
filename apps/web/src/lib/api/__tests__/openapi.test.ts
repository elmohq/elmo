import { describe, expect, it } from "vitest";
import { deploymentOpenApiSpec } from "../openapi";

const ELMO = { name: "Elmo", url: "https://app.elmohq.com" };
const AGENCY = { name: "Acme Visibility", url: "https://visibility.acme.com" };

describe("deploymentOpenApiSpec", () => {
	it("answers with the host the spec was fetched from", () => {
		const spec = deploymentOpenApiSpec(ELMO, "https://app.elmohq.com");

		expect(spec.servers).toEqual([{ url: "https://app.elmohq.com/api/v1", description: "API" }]);
	});

	it("does not leak the vendor into a whitelabel deployment", () => {
		const spec = deploymentOpenApiSpec(AGENCY, "https://visibility.acme.com");

		expect(spec.info.title).toBe("Acme Visibility API");
		expect(spec.info.contact).toEqual({ name: "Acme Visibility", url: "https://visibility.acme.com" });
		expect(spec.servers?.[0].url).toBe("https://visibility.acme.com/api/v1");
	});

	it("serves a self-hosted instance its own address, port and all", () => {
		const spec = deploymentOpenApiSpec({ name: "Elmo", url: "http://localhost:3000" }, "http://localhost:3000");

		expect(spec.servers?.[0].url).toBe("http://localhost:3000/api/v1");
	});

	// The operator's canonical URL is a separate question from where this
	// request landed, and a stale one must not send callers somewhere they
	// cannot reach.
	it("takes the server from the request even when the configured URL differs", () => {
		const spec = deploymentOpenApiSpec(ELMO, "https://staging.elmohq.com");

		expect(spec.servers?.[0].url).toBe("https://staging.elmohq.com/api/v1");
		expect(spec.info.contact).toEqual(ELMO);
	});

	it("leaves the operations alone", () => {
		const spec = deploymentOpenApiSpec(ELMO, "https://app.elmohq.com");

		expect(Object.keys(spec.paths as object)).toContain("/brands");
	});
});
