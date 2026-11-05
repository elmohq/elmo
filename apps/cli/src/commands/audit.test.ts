import type { SiteAuditReport } from "@workspace/site-audit";
import { describe, expect, it } from "vitest";
import { renderReport } from "./audit";

const ESC = "\u001b";
const HOSTILE = `search=yes${ESC}]52;c;aGFja2Vk${ESC}\\${ESC}[2J`;

function report(evidence: string): SiteAuditReport {
	return {
		schemaVersion: 1,
		auditedAt: "2026-01-01T00:00:00.000Z",
		userAgent: "ElmoBot/1.0",
		hosts: [{ host: `bad${ESC}[31m.example`, outcome: "unreachable", hops: [], error: `refused${ESC}[2K` }],
		sites: [
			{
				origin: "https://example.com",
				aliases: [],
				pages: [`https://example.com/${ESC}[8m`],
				checks: [
					{
						id: "content-signals",
						group: "reach",
						title: "Content Signals",
						status: "pass",
						evidence,
						pages: [`https://example.com/a${ESC}]0;title${ESC}\\`],
					},
				],
				summary: { pass: 1, warn: 0, fail: 0, notChecked: 0 },
				blockedAudit: false,
				score: 100,
			},
		],
		score: 100,
		requests: { used: 1, limit: 75, budgetExhausted: false },
	};
}

describe("renderReport", () => {
	it("drops terminal control sequences that come from the audited site", () => {
		const output = renderReport(report(`Content-Signal: ${HOSTILE}.`));

		expect(output).not.toContain(`${ESC}]`);
		expect(output).not.toContain(`${ESC}[2J`);
		expect(output).not.toContain(`${ESC}[2K`);
		expect(output).toContain("search=yes");
	});
});
