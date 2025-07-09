import { ManagementClient } from 'auth0';
import { auth0 } from './auth0';
import { redis } from './redis';

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
		console.error('Error fetching from Redis cache:', error);
	}

	try {
		const userData = await management.users.get({ 
			id: userId, 
			fields: "app_metadata" 
		});

		const appMetadata = userData.data?.app_metadata as AppMetadata || {};

		try {
			await redis.setex(redisKey, CACHE_TTL, JSON.stringify(appMetadata));
		} catch (error) {
			console.error('Error caching to Redis:', error);
		}

		return appMetadata;
	} catch (error) {
		console.error('Error fetching app_metadata from Management API:', error);
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
		console.error('Error clearing Redis cache:', error);
	}
}

