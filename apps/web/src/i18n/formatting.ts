import { getLocale } from "@/paraglide/runtime.js";

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(getLocale(), options).format(value);
}

export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(getLocale(), options).format(new Date(value));
}

export function formatPercent(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(getLocale(), { style: "percent", ...options }).format(value);
}
