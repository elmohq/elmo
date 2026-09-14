/**
 * Turns report tables into downloadable Markdown or Excel files, entirely in
 * the browser. The .xlsx is written by hand (a store-only zip of the minimal
 * OOXML parts) so exporting doesn't pull in a spreadsheet library.
 */

export type ReportCell = string | number | null;

export interface ReportTable {
	title: string;
	headers: string[];
	rows: ReportCell[][];
}

export interface Report {
	title: string;
	/** Label/value lines shown above the tables (brand, period, generation date…). */
	meta: [string, string][];
	tables: ReportTable[];
}

function markdownCell(value: ReportCell): string {
	if (value === null) return "—";
	return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function reportToMarkdown(report: Report): string {
	const lines = [`# ${report.title}`, ""];
	for (const [label, value] of report.meta) lines.push(`- **${label}** : ${value}`);
	for (const table of report.tables) {
		lines.push("", `## ${table.title}`, "");
		if (table.rows.length === 0) {
			lines.push("_—_");
			continue;
		}
		lines.push(`| ${table.headers.map(markdownCell).join(" | ")} |`);
		lines.push(`| ${table.headers.map(() => "---").join(" | ")} |`);
		for (const row of table.rows) lines.push(`| ${row.map(markdownCell).join(" | ")} |`);
	}
	return `${lines.join("\n")}\n`;
}

function xmlEscape(value: string): string {
	// Control characters (bar tab/newlines) are invalid in XML 1.0 and make Excel reject the file.
	const printable = Array.from(value)
		.filter((ch) => ch >= " " || ch === "\t" || ch === "\n" || ch === "\r")
		.join("");
	return (
		printable
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
	);
}

function xlsxCell(value: ReportCell): string {
	if (value === null) return "<c/>";
	if (typeof value === "number" && Number.isFinite(value)) return `<c><v>${value}</v></c>`;
	return `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function sheetXml(rows: ReportCell[][]): string {
	const body = rows.map((row) => `<row>${row.map(xlsxCell).join("")}</row>`).join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** Excel sheet names: max 31 chars, no []:*?/\, unique within the workbook. */
function sheetNames(titles: string[]): string[] {
	const used = new Set<string>();
	return titles.map((title) => {
		const base = title.replace(/[[\]:*?/\\]/g, " ").slice(0, 28) || "Sheet";
		let name = base;
		for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
		used.add(name.toLowerCase());
		return name;
	});
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** A zip with no compression — plenty for a few KB of XML, and trivial to write. */
function storedZip(files: [string, string][]): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	for (const [path, content] of files) {
		const name = encoder.encode(path);
		const data = encoder.encode(content);
		const crc = crc32(data);

		const local = new Uint8Array(30 + name.length + data.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, 0x0800, true); // UTF-8 file names
		lv.setUint32(14, crc, true);
		lv.setUint32(18, data.length, true);
		lv.setUint32(22, data.length, true);
		lv.setUint16(26, name.length, true);
		local.set(name, 30);
		local.set(data, 30 + name.length);

		const central = new Uint8Array(46 + name.length);
		const cv = new DataView(central.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, data.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		central.set(name, 46);

		locals.push(local);
		centrals.push(central);
		offset += local.length;
	}

	const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, files.length, true);
	ev.setUint16(10, files.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);

	const out = new Uint8Array(offset + centralSize + end.length);
	let pos = 0;
	for (const part of [...locals, ...centrals, end]) {
		out.set(part, pos);
		pos += part.length;
	}
	return out;
}

export function reportToXlsx(report: Report): Uint8Array<ArrayBuffer> {
	const summary: ReportTable = { title: report.title, headers: [], rows: report.meta };
	const sheets = [summary, ...report.tables];
	const names = sheetNames(sheets.map((s) => s.title));
	const ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

	return storedZip([
		[
			"[Content_Types].xml",
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
		],
		[
			"_rels/.rels",
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
		],
		[
			"xl/workbook.xml",
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${ns}"><sheets>${names.map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
		],
		[
			"xl/_rels/workbook.xml.rels",
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
		],
		...sheets.map((sheet, i): [string, string] => [
			`xl/worksheets/sheet${i + 1}.xml`,
			sheetXml(sheet.headers.length > 0 ? [sheet.headers, ...sheet.rows] : sheet.rows),
		]),
	]);
}

export function downloadFile(fileName: string, content: BlobPart, type: string) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
