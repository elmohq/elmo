import { markAttributionUsed, storedAttribution } from "@workspace/ui/lib/attribution";
import { recordSignupAttributionFn } from "@/server/signup-attribution";

/**
 * localStorage rather than a cookie: it survives the email-verification link
 * opening in a new tab and the Google OAuth round trip without riding along on
 * every request, and the server only needs it once.
 */
export async function reportSignupAttribution(): Promise<void> {
	const attribution = storedAttribution("localStorage");
	if (!attribution) return;
	try {
		await recordSignupAttributionFn({ data: attribution });
		markAttributionUsed("localStorage");
	} catch {}
}
