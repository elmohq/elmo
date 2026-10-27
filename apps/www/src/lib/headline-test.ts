export const HEADLINE_ARMS = ["default", "win-ai-search"] as const;
export type HeadlineArm = (typeof HEADLINE_ARMS)[number];

const HEADLINE_LINK_PARAM = "hv";

export interface HeadlineTestConfig {
	arms: readonly HeadlineArm[];
	explicitKeys: readonly string[];
	storageKey: string;
	attribute: string;
	botPattern: string;
}

export interface HeadlineDraw {
	explicit: string | null;
	stored: string | null;
	userAgent: string;
	automated: boolean;
	random: number;
}

export function pickHeadline(config: HeadlineTestConfig, draw: HeadlineDraw): HeadlineArm | null {
	if (draw.explicit !== null && config.explicitKeys.includes(draw.explicit)) return null;
	if (draw.automated || new RegExp(config.botPattern, "i").test(draw.userAgent)) return null;
	const stored = config.arms.find((arm) => arm === draw.stored);
	return stored ?? config.arms[Math.floor(draw.random * config.arms.length)];
}

export function startHeadlineTest(config: HeadlineTestConfig, pick: typeof pickHeadline): HeadlineArm | null {
	const root = document.documentElement;
	const current = config.arms.find((arm) => arm === root.getAttribute(config.attribute));
	if (current) return current;
	let stored: string | null = null;
	try {
		stored = window.localStorage.getItem(config.storageKey);
	} catch {}
	const arm = pick(config, {
		explicit: new URLSearchParams(window.location.search).get("v"),
		stored,
		userAgent: navigator.userAgent,
		automated: navigator.webdriver === true,
		random: Math.random(),
	});
	if (!arm) return null;
	root.setAttribute(config.attribute, arm);
	document.querySelector("script[data-domain]")?.setAttribute("event-headline", arm);
	return arm;
}

export function headlineTestScript(config: HeadlineTestConfig): string {
	return `(${startHeadlineTest.toString()})(${JSON.stringify(config)}, ${pickHeadline.toString()});`;
}

export function rememberHeadline(storageKey: string, arm: HeadlineArm | null): void {
	try {
		if (arm) window.localStorage.setItem(storageKey, arm);
		else window.localStorage.removeItem(storageKey);
	} catch {}
}

export function withHeadline(url: string, arm: HeadlineArm | null | undefined): string {
	if (!arm) return url;
	const link = new URL(url);
	link.searchParams.set(HEADLINE_LINK_PARAM, arm);
	return link.toString();
}
