import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResolver = (predicate: unknown) => unknown[];

const mocks = vi.hoisted(() => ({
	resolvers: [] as QueryResolver[],
	predicates: [] as unknown[],
	select: vi.fn(),
}));

vi.mock("../db/db", () => ({
	db: {
		select: mocks.select.mockImplementation(() => {
			const resolver = mocks.resolvers.shift();
			if (!resolver) throw new Error("Missing query resolver");
			let predicate: unknown;
			const query: Record<string, unknown> = {};
			for (const method of ["from", "innerJoin", "orderBy", "limit", "offset"]) {
				query[method] = () => query;
			}
			query.where = (value: unknown) => {
				predicate = value;
				mocks.predicates.push(value);
				return query;
			};
			// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally awaitable.
			query.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
				Promise.resolve(resolver(predicate)).then(resolve, reject);
			return query;
		}),
		transaction: vi.fn(),
	},
}));

import {
	assertOrganizationCompetitorLimit,
	getOrganizationApiBrand,
	getOrganizationApiCompetitor,
	getOrganizationApiPrompt,
	getOrganizationPromptSnapshotContext,
	listOrganizationApiBrands,
	listOrganizationApiCompetitors,
	listOrganizationApiPrompts,
	OrganizationResourceConflictError,
	OrganizationResourceNotFoundError,
} from "./api-resources";

const dialect = new PgDialect();

function predicateParams(predicate: unknown): unknown[] {
	return predicate ? dialect.sqlToQuery(predicate as SQL).params : [];
}

function whenScoped(requiredParams: string[], scoped: unknown[], unscoped: unknown[]): QueryResolver {
	return (predicate) => {
		const params = predicateParams(predicate);
		return requiredParams.every((value) => params.includes(value)) ? scoped : unscoped;
	};
}

describe("organization API resource isolation", () => {
	beforeEach(() => {
		mocks.resolvers.length = 0;
		mocks.predicates.length = 0;
		mocks.select.mockClear();
	});

	it("scopes every collection query to the authenticated organization", async () => {
		const ownBrand = { id: "brand-a" };
		mocks.resolvers.push(
			whenScoped(["org-a"], [{ value: 1 }], [{ value: 99 }]),
			whenScoped(["org-a"], [ownBrand], [{ id: "brand-b" }]),
		);
		await expect(listOrganizationApiBrands({ organizationId: "org-a", limit: 20, offset: 0 })).resolves.toEqual({
			items: [ownBrand],
			total: 1,
		});

		const ownPrompt = { id: "prompt-a", brandId: "brand-a" };
		mocks.resolvers.push(
			whenScoped(["org-a", "brand-a"], [{ value: 1 }], [{ value: 99 }]),
			whenScoped(["org-a", "brand-a"], [ownPrompt], [{ id: "prompt-b", brandId: "brand-b" }]),
		);
		await expect(
			listOrganizationApiPrompts({ organizationId: "org-a", brandId: "brand-a", limit: 20, offset: 0 }),
		).resolves.toEqual({ items: [ownPrompt], total: 1 });

		const ownCompetitor = { id: "competitor-a", brandId: "brand-a" };
		mocks.resolvers.push(
			whenScoped(["org-a", "brand-a"], [{ value: 1 }], [{ value: 99 }]),
			whenScoped(["org-a", "brand-a"], [ownCompetitor], [{ id: "competitor-b", brandId: "brand-b" }]),
		);
		await expect(
			listOrganizationApiCompetitors({ organizationId: "org-a", brandId: "brand-a", limit: 20, offset: 0 }),
		).resolves.toEqual({ items: [ownCompetitor], total: 1 });

		expect(mocks.predicates).toHaveLength(6);
	});

	it("returns not found instead of exposing another organization's direct resources", async () => {
		mocks.resolvers.push(
			whenScoped(["org-a", "brand-b"], [], [{ id: "brand-b" }]),
			whenScoped(["org-a", "prompt-b"], [], [{ id: "prompt-b", brandId: "brand-b" }]),
			whenScoped(["org-a", "competitor-b"], [], [{ id: "competitor-b", brandId: "brand-b" }]),
			whenScoped(
				["org-a", "prompt-b"],
				[],
				[{ prompt: { id: "prompt-b", brandId: "brand-b" }, brand: { id: "brand-b" } }],
			),
		);

		await expect(getOrganizationApiBrand("org-a", "brand-b")).rejects.toBeInstanceOf(OrganizationResourceNotFoundError);
		await expect(getOrganizationApiPrompt("org-a", "prompt-b")).rejects.toBeInstanceOf(
			OrganizationResourceNotFoundError,
		);
		await expect(getOrganizationApiCompetitor("org-a", "competitor-b")).rejects.toBeInstanceOf(
			OrganizationResourceNotFoundError,
		);
		await expect(getOrganizationPromptSnapshotContext("org-a", "prompt-b")).rejects.toBeInstanceOf(
			OrganizationResourceNotFoundError,
		);
	});
});

describe("organization API competitor capacity", () => {
	it("accepts the boundary and rejects a batch that would cross it", () => {
		expect(() => assertOrganizationCompetitorLimit(99, 1)).not.toThrow();
		expect(() => assertOrganizationCompetitorLimit(99, 2)).toThrow(OrganizationResourceConflictError);
	});
});
