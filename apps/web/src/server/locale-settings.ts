import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/lib/db/db";
import { systemSettings, userPreferences } from "@workspace/lib/db/schema";
import {
	DEFAULT_LOCALE,
	isLocale,
	isLocalePreference,
	localePreferenceSchema,
	localeSchema,
	resolveLocale,
	type Locale,
	type LocalePreference,
} from "@workspace/lib/locale";
import { hasReportAccess, isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

const GLOBAL_SETTINGS_ID = "global";

async function getPreference(userId: string): Promise<LocalePreference> {
	const [row] = await db
		.select({ localePreference: userPreferences.localePreference })
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId))
		.limit(1);
	return isLocalePreference(row?.localePreference) ? row.localePreference : "auto";
}

async function getSystemDefault(): Promise<Locale> {
	const [row] = await db
		.select({ defaultLocale: systemSettings.defaultLocale })
		.from(systemSettings)
		.where(eq(systemSettings.id, GLOBAL_SETTINGS_ID))
		.limit(1);
	return isLocale(row?.defaultLocale) ? row.defaultLocale : DEFAULT_LOCALE;
}

export const getLocaleSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	const deployment = getDeployment();
	const headers = getRequestHeaders();
	const [localePreference, systemDefaultLocale] = await Promise.all([
		getPreference(session.user.id),
		getSystemDefault(),
	]);
	const effectivePreference = deployment.mode === "demo" ? "auto" : localePreference;

	return {
		localePreference: effectivePreference,
		systemDefaultLocale,
		resolvedLocale: resolveLocale({
			preference: effectivePreference,
			acceptLanguage: headers.get("accept-language"),
			systemDefault: systemDefaultLocale,
		}),
		isAdmin: isAdmin(session),
		hasReportAccess: hasReportAccess(session),
		readOnly: deployment.features.readOnly,
	};
});

export const updateMyLocalePreferenceFn = createServerFn({ method: "POST" })
	.validator(z.object({ localePreference: localePreferenceSchema }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		if (getDeployment().features.readOnly) throw new Error("LOCALE_SETTINGS_READ_ONLY");

		await db
			.insert(userPreferences)
			.values({ userId: session.user.id, localePreference: data.localePreference })
			.onConflictDoUpdate({
				target: userPreferences.userId,
				set: { localePreference: data.localePreference, updatedAt: new Date() },
			});

		return { success: true };
	});

export const updateSystemDefaultLocaleFn = createServerFn({ method: "POST" })
	.validator(z.object({ defaultLocale: localeSchema }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		if (!isAdmin(session)) throw new Error("LOCALE_SETTINGS_ADMIN_REQUIRED");
		if (getDeployment().features.readOnly) throw new Error("LOCALE_SETTINGS_READ_ONLY");

		await db
			.insert(systemSettings)
			.values({ id: GLOBAL_SETTINGS_ID, defaultLocale: data.defaultLocale, updatedBy: session.user.id })
			.onConflictDoUpdate({
				target: systemSettings.id,
				set: { defaultLocale: data.defaultLocale, updatedAt: new Date(), updatedBy: session.user.id },
			});

		return { success: true };
	});
