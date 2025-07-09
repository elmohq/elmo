import { ManagementClient } from "auth0";
import { auth0 } from "./auth0";
import { redis } from "./redis";
import { db } from "./db/db";
import { brands, type Brand, type NewBrand } from "./db/schema";
import { eq } from "drizzle-orm";

const management = new ManagementClient({
	domain: process.env.AUTH0_MGMT_API_DOMAIN!,
	clientId: process.env.AUTH0_CLIENT_ID!,
	clientSecret: process.env.AUTH0_CLIENT_SECRET!,
});

export type ElmoBrandMetadata = {
	id: string;
	name: string;
};

export type AppMetadata = {
	elmo_orgs?: ElmoBrandMetadata[];
};

const CACHE_TTL = 60 * 5;

function getRedisKey(userId: string): string {
	return `auth0-app-metadata-${userId}`;
}

export async function getAppMetadata(): Promise<AppMetadata> {
	const session = await auth0.getSession();

	if (!session?.user?.sub) {
		return {};
	}

	const userId = session.user.sub;
	const redisKey = getRedisKey(userId);

	try {
		const cachedMetadata = await redis.get(redisKey);
		if (cachedMetadata) {
			return cachedMetadata as AppMetadata;
		}
	} catch (error) {
		console.error("Error fetching from Redis cache:", error);
	}

	try {
		const userData = await management.users.get({
			id: userId,
			fields: "app_metadata",
		});

		const appMetadata = (userData.data?.app_metadata as AppMetadata) || {};

		try {
			await redis.setex(redisKey, CACHE_TTL, JSON.stringify(appMetadata));
		} catch (error) {
			console.error("Error caching to Redis:", error);
		}

		return appMetadata;
	} catch (error) {
		console.error("Error fetching app_metadata from Management API:", error);
		return {};
	}
}

export async function getElmoOrgs(): Promise<ElmoBrandMetadata[]> {
	const appMetadata = await getAppMetadata();
	return appMetadata.elmo_orgs || [];
}

export async function clearAppMetadataCache(): Promise<void> {
	const session = await auth0.getSession();

	if (!session?.user?.sub) {
		return;
	}

	const userId = session.user.sub;
	const redisKey = getRedisKey(userId);

	try {
		await redis.del(redisKey);
	} catch (error) {
		console.error("Error clearing Redis cache:", error);
	}
}

export async function getBrandFromDb(brandId: string): Promise<Brand | undefined> {
	try {
		const result = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		return result;
	} catch (error) {
		console.error("Error fetching brand from database:", error);
		return undefined;
	}
}

export async function createBrand(brandData: { id: string; name: string; website: string }): Promise<Brand | null> {
	try {
		const newBrand: NewBrand = {
			id: brandData.id,
			name: brandData.name,
			website: brandData.website,
			enabled: true,
		};

		const result = await db.insert(brands).values(newBrand).returning();
		return result[0] || null;
	} catch (error) {
		console.error("Error creating brand in database:", error);
		return null;
	}
}

export async function getBrandMetadata(brandId: string): Promise<undefined | ElmoBrandMetadata> {
	const orgs = await getElmoOrgs();
	return orgs.find((org) => org.id === brandId);
}
