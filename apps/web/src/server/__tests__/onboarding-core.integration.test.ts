import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createBrand } from "@/server/onboarding-core";
import { deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;

afterEach(async () => {
	await deleteBrand(brandId);
});

describe("createBrand", () => {
	it("tracks a competitor suggested twice under one name as one competitor with both domains", async () => {
		brandId = `brand-${randomUUID()}`;
		await createBrand({
			id: brandId,
			name: "Acme",
			website: "https://acme.example",
			competitors: [
				{ name: "Globex", domains: ["globex.example"], aliases: ["Globex Corp"] },
				{ name: "Globex", domains: ["globex.example.au"], aliases: [] },
				{ name: "Initech", domains: ["initech.example"], aliases: [] },
			],
			afterCommit: () => {},
		});

		const tracked = await db.query.competitors.findMany({ where: eq(competitors.brandId, brandId) });
		expect(tracked.map((c) => c.name).sort()).toEqual(["Globex", "Initech"]);
		expect(tracked.find((c) => c.name === "Globex")).toMatchObject({
			domains: ["globex.example", "globex.example.au"],
			aliases: ["Globex Corp"],
		});
	});
});
