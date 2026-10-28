import { createServerFn } from "@tanstack/react-start";
import { ATTRIBUTION_KEYS, MAX_ATTRIBUTION_VALUE_LENGTH } from "@workspace/config/signup-attribution";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { userSignupAttribution } from "@workspace/lib/db/schema";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";
import { acceptsSignupAttribution, signupAttributionRow } from "@/server/signup-attribution-core";

const attributionInput = z.partialRecord(z.enum(ATTRIBUTION_KEYS), z.string().max(MAX_ATTRIBUTION_VALUE_LENGTH));

export const recordSignupAttributionFn = createServerFn({ method: "POST" })
	.validator(attributionInput)
	.handler(async ({ data }): Promise<void> => {
		const { mode } = getDeployment();
		if (mode !== "cloud") return;
		const { user, session } = await requireAuthSession();
		const accepted = acceptsSignupAttribution({
			mode,
			userCreatedAt: user.createdAt,
			impersonatedBy: (session as { impersonatedBy?: string | null }).impersonatedBy,
			now: new Date(),
		});
		if (!accepted) return;
		const row = signupAttributionRow(user.id, data);
		if (!row) return;
		await db.insert(userSignupAttribution).values(row).onConflictDoNothing();
	});
