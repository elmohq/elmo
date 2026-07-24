import { describe, expect, it, vi } from "vitest";
import { createInfisicalCredentialLoader } from "./infisical-credentials";

const ENV = {
	INFISICAL_CLIENT_ID: "client-id",
	INFISICAL_CLIENT_SECRET: "client-secret",
	INFISICAL_PROJECT_ID: "project-id",
	INFISICAL_ENVIRONMENT: "prod",
	INFISICAL_SECRET_PATH: "/elmo/providers",
	INFISICAL_SITE_URL: "https://eu.infisical.com",
};

function fakeClient(secrets: Array<{ secretKey: string; secretValue: string }>) {
	const listSecretsWithImports = vi.fn(async () => secrets);
	const client = {
		auth: () => ({
			universalAuth: {
				login: vi.fn(async () => client),
			},
		}),
		secrets: () => ({ listSecretsWithImports }),
	};
	return { client, listSecretsWithImports };
}

describe("createInfisicalCredentialLoader", () => {
	it("authenticates and returns only canonical provider credentials", async () => {
		const { client, listSecretsWithImports } = fakeClient([
			{ secretKey: "OPENAI_API_KEY", secretValue: "sk-cloud" },
			{ secretKey: "OXYLABS_USERNAME", secretValue: "user" },
			{ secretKey: "NOT_AN_ELMO_CREDENTIAL", secretValue: "ignored" },
		]);
		const clientFactory = vi.fn(() => client);
		const load = createInfisicalCredentialLoader({ env: ENV, clientFactory });

		const credentials = await load();

		expect(clientFactory).toHaveBeenCalledWith("https://eu.infisical.com");
		expect(credentials).toEqual(
			new Map([
				["OPENAI_API_KEY", "sk-cloud"],
				["OXYLABS_USERNAME", "user"],
			]),
		);
		expect(listSecretsWithImports).toHaveBeenCalledWith({
			environment: "prod",
			projectId: "project-id",
			secretPath: "/elmo/providers",
			recursive: true,
			expandSecretReferences: true,
			viewSecretValue: true,
		});
	});

	it("reuses the authenticated client across successful refreshes", async () => {
		const { client } = fakeClient([{ secretKey: "OPENAI_API_KEY", secretValue: "sk-cloud" }]);
		const clientFactory = vi.fn(() => client);
		const load = createInfisicalCredentialLoader({ env: ENV, clientFactory });

		await load();
		await load();

		expect(clientFactory).toHaveBeenCalledOnce();
	});

	it("re-authenticates once after an expired token", async () => {
		const first = fakeClient([]);
		first.listSecretsWithImports.mockRejectedValueOnce(new Error("unauthorized"));
		const second = fakeClient([{ secretKey: "OPENAI_API_KEY", secretValue: "fresh" }]);
		const clientFactory = vi.fn().mockReturnValueOnce(first.client).mockReturnValueOnce(second.client);
		const load = createInfisicalCredentialLoader({ env: ENV, clientFactory });

		await expect(load()).resolves.toEqual(new Map([["OPENAI_API_KEY", "fresh"]]));
		expect(clientFactory).toHaveBeenCalledTimes(2);
	});

	it("fails fast when cloud authentication configuration is incomplete", () => {
		expect(() =>
			createInfisicalCredentialLoader({
				env: { ...ENV, INFISICAL_CLIENT_SECRET: "" },
			}),
		).toThrow("INFISICAL_CLIENT_SECRET");
	});
});
