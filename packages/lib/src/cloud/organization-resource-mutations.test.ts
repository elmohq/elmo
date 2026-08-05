import { resolveEntitlements } from "@workspace/config/entitlements";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	withOrganizationEntitlementTransaction: vi.fn(),
}));

vi.mock("../db/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("./capacity", async (importOriginal) => ({
	...(await importOriginal<typeof import("./capacity")>()),
	withOrganizationEntitlementTransaction: mocks.withOrganizationEntitlementTransaction,
}));

import {
	addOrganizationBrandDomain,
	addOrganizationCompetitorDomain,
	createOrganizationCompetitor,
	OrganizationResourceConflictError,
	OrganizationResourceNotFoundError,
	replaceOrganizationCompetitors,
	updateOrganizationBrand,
} from "./api-resources";
import { CapacityExceededError } from "./capacity";

type BoundaryInput = {
	mode: string;
	organizationId: string;
	run: (context: { tx: Record<string, unknown>; resolved: ReturnType<typeof resolveEntitlements> }) => Promise<unknown>;
};

function queryBuilder(result: unknown[], predicates: unknown[] = []) {
	const builder: Record<string, unknown> = {};
	for (const method of ["from", "innerJoin"]) builder[method] = () => builder;
	builder.where = (predicate: unknown) => {
		predicates.push(predicate);
		return builder;
	};
	builder.limit = async () => result;
	// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally awaitable.
	builder.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve(result).then(resolve, reject);
	return builder;
}

function capturedBoundary(): BoundaryInput {
	const input = mocks.withOrganizationEntitlementTransaction.mock.calls.at(-1)?.[0];
	if (!input) throw new Error("Missing organization transaction");
	return input as BoundaryInput;
}

const starter = resolveEntitlements({
	mode: "cloud",
	subscription: {
		planId: "starter",
		status: "active",
		currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
		delinquentSince: null,
	},
});
const dialect = new PgDialect();

describe("organization resource mutation boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.withOrganizationEntitlementTransaction.mockResolvedValue({});
	});

	it("routes every authenticated UI resource mutation through a cloud organization transaction", async () => {
		await updateOrganizationBrand({ organizationId: "org-a", brandId: "brand-a", name: "Brand A" });
		await replaceOrganizationCompetitors({ organizationId: "org-a", brandId: "brand-a", competitors: [] });
		await addOrganizationBrandDomain({ organizationId: "org-a", brandId: "brand-a", domain: "brand.example" });
		await addOrganizationCompetitorDomain({
			organizationId: "org-a",
			brandId: "brand-a",
			competitorId: "competitor-a",
			domain: "competitor.example",
		});
		await createOrganizationCompetitor({
			organizationId: "org-a",
			brandId: "brand-a",
			name: "Competitor",
			domains: ["competitor.example"],
			aliases: [],
		});

		expect(
			mocks.withOrganizationEntitlementTransaction.mock.calls.map(([input]) => ({
				mode: input.mode,
				organizationId: input.organizationId,
			})),
		).toEqual(Array.from({ length: 5 }, () => ({ mode: "cloud", organizationId: "org-a" })));
	});

	it("checks organization-wide brand capacity before re-enabling a brand", async () => {
		await updateOrganizationBrand({ organizationId: "org-a", brandId: "brand-a", enabled: true });
		const selectResults = [
			[
				{
					id: "brand-a",
					organizationId: "org-a",
					enabled: false,
				},
			],
			[{ value: 1 }],
		];
		const tx = {
			select: vi.fn(() => queryBuilder(selectResults.shift() ?? [])),
			update: vi.fn(() => {
				throw new Error("capacity-denied update reached persistence");
			}),
		};

		await expect(capturedBoundary().run({ tx, resolved: starter })).rejects.toBeInstanceOf(CapacityExceededError);
		expect(tx.update).not.toHaveBeenCalled();
	});

	it("checks competitor replacement capacity before deleting existing rows", async () => {
		await replaceOrganizationCompetitors({
			organizationId: "org-a",
			brandId: "brand-a",
			competitors: Array.from({ length: 101 }, (_, index) => ({
				name: `Competitor ${index}`,
				domains: [`competitor-${index}.example`],
				aliases: [],
			})),
		});
		const tx = {
			select: vi.fn(() => queryBuilder([{ id: "brand-a", organizationId: "org-a" }])),
			delete: vi.fn(),
		};

		await expect(capturedBoundary().run({ tx, resolved: starter })).rejects.toBeInstanceOf(
			OrganizationResourceConflictError,
		);
		expect(tx.delete).not.toHaveBeenCalled();
	});

	it("rejects competitor writes when the scoped lookup cannot find the resource", async () => {
		await addOrganizationCompetitorDomain({
			organizationId: "org-a",
			brandId: "brand-a",
			competitorId: "competitor-b",
			domain: "competitor.example",
		});
		const predicates: unknown[] = [];
		const tx = {
			select: vi.fn(() => queryBuilder([], predicates)),
			update: vi.fn(),
		};

		await expect(capturedBoundary().run({ tx, resolved: starter })).rejects.toBeInstanceOf(
			OrganizationResourceNotFoundError,
		);
		expect(dialect.sqlToQuery(predicates[0] as SQL).params).toEqual(["org-a", "competitor-b"]);
		expect(tx.update).not.toHaveBeenCalled();
	});
});
