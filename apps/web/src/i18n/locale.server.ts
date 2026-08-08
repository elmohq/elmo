import { eq } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { systemSettings, userPreferences } from "@workspace/lib/db/schema";
import { resolveLocale, type Locale, type LocalePreference } from "@workspace/lib/locale";
import { auth } from "@/lib/auth/server";

const GLOBAL_SETTINGS_ID = "global";

async function readUserPreference(userId: string): Promise<LocalePreference | undefined> {
	try {
		const [row] = await db
			.select({ localePreference: userPreferences.localePreference })
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId))
			.limit(1);
		return row?.localePreference as LocalePreference | undefined;
	} catch {
		return undefined;
	}
}

async function readSystemDefault(): Promise<Locale | undefined> {
	try {
		const [row] = await db
			.select({ defaultLocale: systemSettings.defaultLocale })
			.from(systemSettings)
			.where(eq(systemSettings.id, GLOBAL_SETTINGS_ID))
			.limit(1);
		return row?.defaultLocale as Locale | undefined;
	} catch {
		return undefined;
	}
}

export async function resolveRequestLocale(request: Request): Promise<Locale> {
	let userId: string | undefined;
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		userId = session?.user.id;
	} catch {
		userId = undefined;
	}

	const shouldIgnoreSharedUser = process.env.DEPLOYMENT_MODE === "demo";
	const [preference, systemDefault] = await Promise.all([
		userId && !shouldIgnoreSharedUser ? readUserPreference(userId) : undefined,
		readSystemDefault(),
	]);

	return resolveLocale({
		preference,
		acceptLanguage: request.headers.get("accept-language"),
		systemDefault,
	});
}
