import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, brands } from "@/lib/db/schema";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { eq, count, desc, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const brandId = searchParams.get("brandId");

		// Parse and validate page parameter
		const pageParam = parseInt(searchParams.get("page") || "1");
		if (pageParam < 1) {
			return NextResponse.json(
				{ error: "Validation Error", message: "Page must be a positive integer" },
				{ status: 400 },
			);
		}
		const page = pageParam;

		// Parse and validate limit parameter
		const limitParam = parseInt(searchParams.get("limit") || "20");
		if (limitParam < 1) {
			return NextResponse.json(
				{ error: "Validation Error", message: "Limit must be a positive integer" },
				{ status: 400 },
			);
		}
		const limit = limitParam;

		const offset = (page - 1) * limit;

		// Build query conditions
		const whereConditions = [];
		if (brandId) {
			whereConditions.push(eq(prompts.brandId, brandId));
		}

		// Get total count
		const [totalCountResult] = await db
			.select({ count: count() })
			.from(prompts)
			.where(whereConditions.length > 0 ? whereConditions[0] : undefined);

		const totalCount = totalCountResult?.count || 0;
		const totalPages = Math.ceil(totalCount / limit);

		// Get prompts with pagination
		const baseQuery = db
			.select({
				id: prompts.id,
				brandId: prompts.brandId,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				value: prompts.value,
				enabled: prompts.enabled,
				createdAt: prompts.createdAt,
				updatedAt: prompts.updatedAt,
			})
			.from(prompts);

		const promptsList =
			whereConditions.length > 0
				? await baseQuery.where(whereConditions[0]).orderBy(desc(prompts.createdAt)).limit(limit).offset(offset)
				: await baseQuery.orderBy(desc(prompts.createdAt)).limit(limit).offset(offset);

		return NextResponse.json({
			prompts: promptsList,
			pagination: {
				page,
				limit,
				total: totalCount,
				totalPages,
			},
		});
	} catch (error) {
		console.error("Error fetching prompts:", error);
		return NextResponse.json({ error: "Internal Server Error", message: "Failed to fetch prompts" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { brandId, value, groupCategory, groupPrefix } = body;

		// Validate required fields
		if (!brandId || !value) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "brandId and value are required fields",
				},
				{ status: 400 },
			);
		}

		if (typeof value !== "string" || value.trim().length === 0) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "value must be a non-empty string",
				},
				{ status: 400 },
			);
		}

		// Verify brand exists
		const brandExists = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);

		if (brandExists.length === 0) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: `Brand with ID '${brandId}' not found`,
				},
				{ status: 400 },
			);
		}

		// Create the prompt
		const [newPrompt] = await db
			.insert(prompts)
			.values({
				brandId: brandId.trim(),
				value: value.trim(),
				groupCategory: groupCategory ? groupCategory.trim() : null,
				groupPrefix: groupPrefix ? groupPrefix.trim() : null,
				enabled: true, // Always enable new prompts in admin API
			})
			.returning();

		// Create job scheduler for the new prompt
		const jobSchedulerCreated = await createPromptJobScheduler(newPrompt.id);
		if (!jobSchedulerCreated) {
			console.warn(`Failed to create job scheduler for prompt ${newPrompt.id}`);
		}

		return NextResponse.json(newPrompt, { status: 201 });
	} catch (error) {
		console.error("Error creating prompt:", error);
		return NextResponse.json({ error: "Internal Server Error", message: "Failed to create prompt" }, { status: 500 });
	}
}
