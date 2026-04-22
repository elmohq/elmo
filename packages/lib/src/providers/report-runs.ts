/**
 * Whitelabel deployments preserve the legacy asymmetric per-candidate sample
 * counts used before SCRAPE_TARGETS drove dispatch. Any model outside this
 * map on a whitelabel deployment is a configuration error — the legacy report
 * flow only knew how to sample these three.
 *
 * Exported so the web app can warn admins when a SCRAPE_TARGETS entry would
 * crash report generation (see `/admin/providers`).
 */
export const WHITELABEL_REPORT_RUNS_PER_MODEL: Record<string, number> = {
	chatgpt: 2,
	claude: 1,
	"google-ai-mode": 1,
};
