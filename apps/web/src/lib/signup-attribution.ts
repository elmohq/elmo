import { markAttributionUsed, storedAttribution } from "@workspace/ui/lib/attribution";
import { recordSignupAttributionFn } from "@/server/signup-attribution";

export async function reportSignupAttribution(): Promise<void> {
	const attribution = storedAttribution("localStorage");
	if (!attribution) return;
	try {
		await recordSignupAttributionFn({ data: attribution });
		markAttributionUsed("localStorage");
	} catch {}
}
