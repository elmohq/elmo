import { describe, expect, it } from "vitest";
import { summarizeMcpClient } from "../client-summary";

const registered = {
	clientId: "UnfZwDzkMcQTKQuUuOghRvaLYAUYEajE",
	clientDiscoveryId: null,
	name: "Claude Code",
	redirectUris: ["http://localhost:3118/callback"],
};

describe("what the consent screen can say about a client", () => {
	it("attributes a metadata-document client to the domain that published it", () => {
		const summary = summarizeMcpClient({
			...registered,
			clientId: "https://client.example.com/oauth/client.json",
			clientDiscoveryId: "cimd",
		});

		expect(summary.publisherHost).toBe("client.example.com");
	});

	it("attributes a self-registered client to no one, whatever it calls itself", () => {
		expect(summarizeMcpClient(registered).publisherHost).toBeNull();
	});

	it("flags a client that only ever sends the browser back to this machine", () => {
		expect(summarizeMcpClient(registered).loopbackOnly).toBe(true);
		expect(
			summarizeMcpClient({ ...registered, redirectUris: ["http://127.0.0.1:1455/cb", "https://www.example.com/cb"] })
				.loopbackOnly,
		).toBe(false);
	});

	it("lists where the client sends the browser, once per host", () => {
		const summary = summarizeMcpClient({
			...registered,
			redirectUris: ["http://127.0.0.1:1455/a", "http://127.0.0.1:1455/b", "https://www.example.com/cb"],
		});

		expect(summary.redirectHosts).toEqual(["127.0.0.1:1455", "www.example.com"]);
	});
});
