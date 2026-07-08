/** Configuration + brand tokens for the repo-activity SVG. */

import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";

export const REPO = "elmohq/elmo";

/** Rolling window for the "last N days" KPIs. */
export const WINDOW_DAYS = 30;
/** How many weeks of history the activity chart shows. */
export const HISTORY_WEEKS = 30;
/** Cap on avatars rendered in the top-contributors row. */
export const MAX_CONTRIB_AVATARS = 12;

/** Friendly display names for the repo's `area/*` labels. */
export const AREA_LABEL_NAMES: Record<string, string> = {
	"area/core": "Core",
	"area/cloud": "Cloud",
	"area/whitelabel": "White-label",
	"area/extensions": "Extensions",
	"area/admin": "Admin",
	"area/oss": "Open Source",
	"area/marketing": "Marketing",
};

/** Stable ordering + colour assignment for area labels (they share one colour on GitHub). */
export const AREA_LABEL_ORDER = [
	"area/core",
	"area/cloud",
	"area/whitelabel",
	"area/extensions",
	"area/admin",
	"area/oss",
	"area/marketing",
];

/** Brand chart palette (base tier) used for distribution segments. */
export const CHART_COLORS = DEFAULT_CHART_COLORS.slice(0, 11);

/** Known automation accounts to exclude from the contributor list. */
const BOT_LOGINS = new Set([
	"dependabot",
	"dependabot-preview",
	"renovate",
	"github-actions",
	"blacksmith-sh",
	"pre-commit-ci",
	"codecov",
	"codecov-commenter",
	"mergify",
	"sentry-io",
	"allcontributors",
	"imgbot",
	"snyk-bot",
	"greenkeeper",
	"restyled-io",
	"cla-bot",
	"netlify",
	"vercel",
	"changeset-bot",
	"socket-security",
]);

/**
 * A contributor counts as a bot when GitHub types it as one, its login carries
 * the conventional `[bot]` suffix, or it appears on the known-automation list.
 */
export function isBot(login: string, type?: string): boolean {
	if (type === "Bot") return true;
	const normalized = login.toLowerCase().replace(/\[bot\]$/, "");
	if (login.toLowerCase().endsWith("[bot]")) return true;
	return BOT_LOGINS.has(normalized);
}
