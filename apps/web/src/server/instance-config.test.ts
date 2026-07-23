import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	entityDeny: null as string | null,
	entityCalls: [] as string[],
	keysByProvider: {} as Record<string, string[]>,
	encryptionKeyMissing: false,
	overlayRefreshes: 0,
	selectResults: [] as unknown[][],
	dbWrites: [] as { type: string; values?: Record<string, unknown> }[],
	providers: [] as { id: string; name: string; isConfigured: () => boolean }[],
	entitlements: { planKey: "starter" } as Record<string, unknown>,
}));

vi.mock("@tanstack/react-start", () => {
	const builder = () => {
		const b: Record<string, unknown> = {};
		b.validator = () => b;
		b.middleware = () => b;
		b.handler = () => () => undefined;
		return b;
	};
	return { createServerFn: builder };
});

vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: async () => ({ user: { id: "u-1", role: "admin" } }),
	isAdmin: () => true,
}));

vi.mock("@/lib/auth/config-gates", () => ({
	requireEntityWrite: async (entity: string) => {
		state.entityCalls.push(entity);
		if (state.entityDeny) throw new Error(state.entityDeny);
	},
}));

vi.mock("@workspace/lib/secrets", () => ({
	getCredentialKeysForProvider: (id: string) => state.keysByProvider[id] ?? [],
	encryptProviderCredentials: (providerId: string, record: Record<string, string>) => {
		if (state.encryptionKeyMissing) {
			throw new Error("ELMO_ENCRYPTION_KEY is not set — cannot store encrypted credentials");
		}
		return {
			encryptedData: {
				v: 1,
				keyId: "k",
				iv: "iv",
				ct: `CIPHERTEXT(${providerId}:${Object.keys(record).length})`,
				tag: "t",
			},
			hint: "t-42",
		};
	},
	refreshCredentialOverlay: async () => {
		state.overlayRefreshes++;
	},
}));

vi.mock("@workspace/lib/providers", () => ({
	getAllProviders: () => state.providers,
	getProvider: (id: string) => {
		const provider = state.providers.find((p) => p.id === id);
		if (!provider) throw new Error(`Unknown provider: "${id}"`);
		return provider;
	},
}));

vi.mock("@workspace/lib/config/resolve", () => ({
	clearConfigCache: () => {},
}));

vi.mock("@workspace/lib/config/entitlements", () => ({
	getEntitlements: async () => state.entitlements,
}));

vi.mock("@workspace/lib/db/db", () => {
	const chain = () => {
		const c: Record<string, unknown> = {};
		for (const method of ["from", "innerJoin", "where", "limit", "orderBy"]) {
			c[method] = () => c;
		}
		c.then = (resolve: (rows: unknown[]) => void, reject: (e: unknown) => void) =>
			Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
		return c;
	};
	return {
		db: {
			select: () => chain(),
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					onConflictDoUpdate: () => {
						state.dbWrites.push({ type: "upsert", values });
						return Promise.resolve();
					},
					onConflictDoNothing: () => ({
						returning: () => {
							state.dbWrites.push({ type: "insert", values });
							return Promise.resolve([values]);
						},
					}),
				}),
			}),
			update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
			delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
		},
	};
});

import {
	listProviderCredentialsImpl,
	setOrganizationSettingsImpl,
	upsertProviderCredentialImpl,
} from "./instance-config.server";

beforeEach(() => {
	state.entityDeny = null;
	state.entityCalls = [];
	state.keysByProvider = { olostep: ["OLOSTEP_API_KEY"], stub: [] };
	state.encryptionKeyMissing = false;
	state.overlayRefreshes = 0;
	state.selectResults = [];
	state.dbWrites = [];
	state.providers = [
		{ id: "olostep", name: "Olostep", isConfigured: () => true },
		{ id: "stub", name: "Stub", isConfigured: () => true },
	];
	state.entitlements = { planKey: "starter" };
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

const STORED_ROW = {
	provider: "olostep",
	source: "encrypted",
	hint: "t-42",
	lastVerifiedAt: null,
	lastVerifyError: null,
};

describe("upsertProviderCredentialImpl", () => {
	it("stores encrypted and returns ONLY the status shape — no plaintext, no payload", async () => {
		state.selectResults = [[STORED_ROW]]; // credentialStatusFor read-back
		const result = await upsertProviderCredentialImpl({
			provider: "olostep",
			values: { OLOSTEP_API_KEY: "sk-super-secret-value" },
		});

		expect(state.entityCalls).toEqual(["provider_credentials"]);
		expect(result).toMatchObject({ provider: "olostep", hasStoredCredential: true, source: "encrypted", hint: "t-42" });
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("sk-super-secret-value");
		expect(serialized).not.toContain("CIPHERTEXT");
		expect(serialized).not.toContain("encryptedData");
		expect(serialized).not.toContain("secretRef");
		expect(state.overlayRefreshes).toBe(1);

		// The DB write itself carries the ciphertext (that's its job), never plaintext.
		const written = JSON.stringify(state.dbWrites[0]?.values);
		expect(written).toContain("CIPHERTEXT");
		expect(written).not.toContain("sk-super-secret-value");
	});

	it("rejects credential keys the provider does not declare", async () => {
		await expect(upsertProviderCredentialImpl({ provider: "olostep", values: { WRONG_KEY: "x" } })).rejects.toThrow(
			/Unknown credential key\(s\) for "olostep": WRONG_KEY/,
		);
		expect(state.dbWrites).toHaveLength(0);
	});

	it("rejects providers with no storable credentials", async () => {
		await expect(upsertProviderCredentialImpl({ provider: "stub", values: { X: "y" } })).rejects.toThrow(
			/has no storable credentials/,
		);
	});

	it("fails with the typed message when ELMO_ENCRYPTION_KEY is missing, touching nothing", async () => {
		state.encryptionKeyMissing = true;
		await expect(
			upsertProviderCredentialImpl({ provider: "olostep", values: { OLOSTEP_API_KEY: "sk-x" } }),
		).rejects.toThrow(/ELMO_ENCRYPTION_KEY is not set/);
		expect(state.dbWrites).toHaveLength(0);
		expect(state.overlayRefreshes).toBe(0);
	});

	it("is blocked by the entity gate (demo / non-admin)", async () => {
		state.entityDeny = "Forbidden: writes-disabled";
		await expect(
			upsertProviderCredentialImpl({ provider: "olostep", values: { OLOSTEP_API_KEY: "sk-x" } }),
		).rejects.toThrow("Forbidden: writes-disabled");
		expect(state.dbWrites).toHaveLength(0);
	});
});

describe("listProviderCredentialsImpl", () => {
	it("lists only providers with declared keys and never exposes payload fields", async () => {
		state.selectResults = [[STORED_ROW]];
		const list = await listProviderCredentialsImpl();

		expect(list.map((p) => p.provider)).toEqual(["olostep"]); // stub has no keys
		expect(list[0]).toMatchObject({ hasStoredCredential: true, source: "encrypted", keys: ["OLOSTEP_API_KEY"] });
		const serialized = JSON.stringify(list);
		expect(serialized).not.toContain("encryptedData");
		expect(serialized).not.toContain("secretRef");
	});

	it("reports env-configured providers when every declared key is set in the environment", async () => {
		vi.stubEnv("OLOSTEP_API_KEY", "env-value");
		state.selectResults = [[]];
		const list = await listProviderCredentialsImpl();
		expect(list[0]).toMatchObject({ provider: "olostep", configuredViaEnv: true, source: "env" });
		expect(JSON.stringify(list)).not.toContain("env-value");
	});
});

describe("setOrganizationSettingsImpl", () => {
	it("is staff-only via the entity gate", async () => {
		state.entityDeny = "Forbidden: instance-admin-required";
		await expect(
			setOrganizationSettingsImpl({ organizationId: "org-1", planKey: "starter", entitlementOverrides: null }),
		).rejects.toThrow("Forbidden: instance-admin-required");
		expect(state.entityCalls).toEqual(["organization_settings"]);
		expect(state.dbWrites).toHaveLength(0);
	});

	it("rejects an unknown plan key", async () => {
		state.selectResults = [[{ id: "org-1" }]];
		await expect(
			setOrganizationSettingsImpl({ organizationId: "org-1", planKey: "gold", entitlementOverrides: null }),
		).rejects.toThrow(/Unknown plan "gold"/);
	});

	it("upserts settings and echoes the resolved entitlements", async () => {
		state.selectResults = [[{ id: "org-1" }]];
		const result = await setOrganizationSettingsImpl({
			organizationId: "org-1",
			planKey: "starter",
			entitlementOverrides: { claudePromptPool: 5 },
		});
		expect(state.dbWrites[0]).toMatchObject({
			type: "upsert",
			values: { organizationId: "org-1", planKey: "starter", entitlementOverrides: { claudePromptPool: 5 } },
		});
		expect(result).toMatchObject({ organizationId: "org-1", planKey: "starter", entitlements: state.entitlements });
	});
});
