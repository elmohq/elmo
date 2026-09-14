import { describe, expect, it } from "vitest";
import { type Report, reportToMarkdown, reportToXlsx } from "@/lib/report-export";

const report: Report = {
	title: "Report — Acme & <Co>",
	meta: [["Brand", "Acme"]],
	tables: [
		{ title: "Trends", headers: ["Date", "Visibility (%)"], rows: [["2026-09-01", 41.5], ["2026-09-02", null]] },
		{ title: "Pages", headers: ["URL", "Title"], rows: [["https://x.com/a|b", "Line\nbreak"]] },
	],
};

describe("reportToMarkdown", () => {
	it("renders tables that pipes and newlines in cells can't break", () => {
		const md = reportToMarkdown(report);
		expect(md).toContain("| 2026-09-01 | 41.5 |");
		expect(md).toContain("| 2026-09-02 | — |");
		expect(md).toContain("| https://x.com/a\\|b | Line break |");
	});
});

describe("reportToXlsx", () => {
	it("produces a zip with one worksheet per table plus a summary sheet", () => {
		const bytes = reportToXlsx(report);
		const text = new TextDecoder().decode(bytes);
		expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
		expect(text).toContain("xl/worksheets/sheet3.xml");
		expect(text).not.toContain("xl/worksheets/sheet4.xml");
		expect(text).toContain("Report — Acme &amp; &lt;Co&gt;");
		expect(text).toContain("<v>41.5</v>");
	});
});
