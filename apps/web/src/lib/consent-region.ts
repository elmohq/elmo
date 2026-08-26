import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { countryRequiresConsent } from "@workspace/ui/lib/cookie-consent";

/** Geo headers an edge may set in front of the app, in preference order. */
const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "x-country-code"];

/**
 * Whether this request came from somewhere that requires prior consent before
 * analytics cookies. `null` means nothing in front of us said, in which case the
 * browser falls back to the visitor's time zone.
 */
export const getConsentRegion = createServerFn({ method: "GET" }).handler((): boolean | null => {
	const { headers } = getRequest();
	for (const name of COUNTRY_HEADERS) {
		const value = headers.get(name);
		if (value) return countryRequiresConsent(value);
	}
	return null;
});
