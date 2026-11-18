import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

const COOKIE = "tz";

export function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function isTimezone(value: string | undefined): value is string {
	if (!value) return false;
	try {
		Intl.DateTimeFormat("en-CA", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** On the server this is what the browser reported on an earlier visit, so it is undefined on a first one. */
export const viewerTimezone = createIsomorphicFn()
	.server(() => {
		const remembered = getCookie(COOKIE);
		return isTimezone(remembered) ? remembered : undefined;
	})
	.client((): string | undefined => browserTimezone());

export function rememberViewerTimezone(): void {
	document.cookie = `${COOKIE}=${encodeURIComponent(browserTimezone())}; path=/; max-age=31536000; samesite=lax`;
}
