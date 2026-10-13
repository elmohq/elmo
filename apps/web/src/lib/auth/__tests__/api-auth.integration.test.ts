import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { apikey, brands, member, organization, user } from "@workspace/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ApiAuthResult, resolveApiAuth } from "../api-auth";
import { recordApiKeyGrant } from "../api-key-grants";

// The token is the key's id, so each case can name the row it means.
const verifyApiKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({ auth: { api: { verifyApiKey } } }));

const orgId = `org-${randomUUID()}`;
const otherOrgId = `org-${randomUUID()}`;
const brandA = `brand-${randomUUID()}`;
const brandB = `brand-${randomUUID()}`;
const foreignBrand = `brand-${randomUUID()}`;
const userIds: string[] = [];

async function createUser(organizationId: string | null) {
	const id = `user-${randomUUID()}`;
	userIds.push(id);
	await db.insert(user).values({ id, name: "Issuer", email: `${id}@example.com` });
	if (organizationId) {
		await db
			.insert(member)
			.values({ id: randomUUID(), organizationId, userId: id, role: "member", createdAt: new Date() });
	}
	return id;
}

async function createKey(grant: { brandIds: string[] | null; createdByUserId: string } | null) {
	const id = `key-${randomUUID()}`;
	await db
		.insert(apikey)
		.values({ id, referenceId: orgId, key: id, createdAt: new Date(), updatedAt: new Date(), enabled: true });
	if (grant) await recordApiKeyGrant({ apiKeyId: id, ...grant });
	return id;
}

async function authenticate(keyId: string): Promise<ApiAuthResult> {
	const [row] = await db.select().from(apikey).where(eq(apikey.id, keyId));
	verifyApiKey.mockResolvedValueOnce({ valid: true, key: { ...row, permissions: { api: ["read"] } } });
	return resolveApiAuth(new Request("http://localhost/api/v1/me", { headers: { Authorization: `Bearer ${keyId}` } }));
}

function reach(result: ApiAuthResult) {
	if ("failure" in result) return result.failure.status;
	if (result.auth.kind !== "organization") throw new Error("expected an organization key");
	return result.auth.brandIds;
}

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: orgId, name: "Acme", slug: orgId, createdAt: new Date() },
		{ id: otherOrgId, name: "Globex", slug: otherOrgId, createdAt: new Date() },
	]);
	await db.insert(brands).values([
		{ id: brandA, organizationId: orgId, name: "A", website: "https://a.example" },
		{ id: brandB, organizationId: orgId, name: "B", website: "https://b.example" },
		{ id: foreignBrand, organizationId: otherOrgId, name: "F", website: "https://f.example" },
	]);
});

afterAll(async () => {
	await db.delete(user).where(inArray(user.id, userIds));
	await db.delete(brands).where(inArray(brands.organizationId, [orgId, otherOrgId]));
	await db.delete(organization).where(inArray(organization.id, [orgId, otherOrgId]));
});

describe("resolveApiAuth with grants", () => {
	it("reaches every brand when issued for all of them", async () => {
		const issuer = await createUser(orgId);
		expect(reach(await authenticate(await createKey({ brandIds: null, createdByUserId: issuer })))).toBeNull();
	});

	it("reaches only the brands it was issued for, never another organization's", async () => {
		const issuer = await createUser(orgId);
		const key = await createKey({ brandIds: [brandA, foreignBrand], createdByUserId: issuer });
		expect(reach(await authenticate(key))).toEqual([brandA]);
	});

	it("reaches nothing, rather than everything, once its only brand is deleted", async () => {
		const issuer = await createUser(orgId);
		const doomed = `brand-${randomUUID()}`;
		await db.insert(brands).values({ id: doomed, organizationId: orgId, name: "D", website: "https://d.example" });
		const key = await createKey({ brandIds: [doomed], createdByUserId: issuer });
		await db.delete(brands).where(eq(brands.id, doomed));
		expect(reach(await authenticate(key))).toEqual([]);
	});

	it("stops authenticating when its issuer leaves the organization", async () => {
		const issuer = await createUser(orgId);
		const key = await createKey({ brandIds: [brandB], createdByUserId: issuer });
		expect(reach(await authenticate(key))).toEqual([brandB]);

		await db.delete(member).where(eq(member.userId, issuer));
		expect(reach(await authenticate(key))).toBe(401);
	});

	it("stops authenticating when its issuer's account is deleted", async () => {
		const issuer = await createUser(orgId);
		const key = await createKey({ brandIds: null, createdByUserId: issuer });
		await db.delete(user).where(eq(user.id, issuer));
		expect(reach(await authenticate(key))).toBe(401);
	});

	it("does not authenticate a key with no grant", async () => {
		expect(reach(await authenticate(await createKey(null)))).toBe(401);
	});
});
