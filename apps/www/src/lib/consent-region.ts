import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { countryRequiresConsent } from "@workspace/ui/lib/cookie-consent";

/**
 * Geo headers set by the edge in front of us, in preference order. Vercel is
 * where www runs today; the others are here so a move doesn't silently turn the
 * banner off.
 */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code"];

/**
 * Whether this request came from somewhere that requires prior consent.
 *
 * `null` means the edge didn't tell us — the client falls back to the visitor's
 * time zone. Resolved on the server so the answer costs no geo-IP lookup and no
 * extra request in the browser.
 */
export const getConsentRegion = createServerFn({ method: "GET" }).handler((): boolean | null => {
	const { headers } = getRequest();
	for (const name of COUNTRY_HEADERS) {
		const value = headers.get(name);
		if (value) return countryRequiresConsent(value);
	}
	return null;
});
