import { defineCustomClientStrategy, isLocale } from "@/paraglide/runtime.js";

if (typeof document !== "undefined") {
	defineCustomClientStrategy("custom-account-locale", {
		getLocale: () => {
			const locale = document.documentElement.lang;
			return isLocale(locale) ? locale : undefined;
		},
		setLocale: () => undefined,
	});
}
