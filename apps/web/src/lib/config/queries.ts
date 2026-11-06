import { getConsentRegion } from "@/lib/consent-region";
import { getClientConfig, getEnvValidationStateFn } from "@/server/config";

/**
 * The server answers this per request on purpose: `hasUsers` (and with it
 * `canRegister`) flips the first time someone signs up, and a server-side cache
 * would keep serving the pre-signup answer until the next restart. The client
 * keeps its answer for the life of the page, seeded from the server render, so
 * no navigation pays for it.
 */
export const rootConfigQuery = {
	queryKey: ["root-config"] as const,
	queryFn: async () => {
		const [clientConfig, envValidation, consentRegion] = await Promise.all([
			getClientConfig(),
			getEnvValidationStateFn(),
			getConsentRegion(),
		]);
		return { clientConfig, envValidation, consentRegion };
	},
	staleTime: Number.POSITIVE_INFINITY,
};
