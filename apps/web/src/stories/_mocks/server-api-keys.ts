/**
 * Mock for @/server/api-keys used in Storybook stories. The real module talks to
 * the better-auth api-key plugin; stories drive the shapes the page renders and
 * the two writes it offers.
 */

import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";

export interface ApiKeySummary {
	id: string;
	name: string | null;
	start: string | null;
	scopes: ApiScope[];
	brandIds: string[] | null;
	enabled: boolean;
	createdAt: string | null;
	lastUsedAt: string | null;
	expiresAt: string | null;
}

export type ApiKeysPageData = {
	organization: { id: string; name: string; role: string };
	canManage: boolean;
	keys: ApiKeySummary[];
	brands: { id: string; name: string }[];
	allScopes: readonly ApiScope[];
	expiryOptions: readonly number[];
};

const DEFAULT: ApiKeysPageData = {
	organization: { id: "org-1", name: "Acme", role: "admin" },
	canManage: true,
	keys: [],
	brands: [
		{ id: "brand-1", name: "Acme Corp" },
		{ id: "brand-2", name: "Acme Labs" },
		{ id: "brand-3", name: "Acme Studio" },
	],
	allScopes: API_SCOPES,
	expiryOptions: [30, 90, 180, 365],
};

let _page: ApiKeysPageData = DEFAULT;

export function setMockApiKeys(page: Partial<ApiKeysPageData>) {
	_page = { ...DEFAULT, ...page };
}

export const listApiKeysFn = async () => _page;

export const createApiKeyFn = async () => ({
	key: "elmo_5f3b9c1d84a24e7fbc2a6d0e91f7c3b8",
	summary: _page.keys[0] ?? null,
});

export const revokeApiKeyFn = async () => ({ revoked: true as const });
