export type DomainInputResult = { ok: true; domain: string; host: string } | { ok: false; error: string };

// Hostnames that only resolve inside someone's network, never on the public web.
const PRIVATE_SUFFIXES = [
	"localhost",
	"local",
	"internal",
	"intranet",
	"lan",
	"home",
	"corp",
	"home.arpa",
	"test",
	"example",
	"invalid",
	"onion",
];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Reduce what a visitor typed ("https://www.Acme.com/pricing", "acme.com") to
 * the public hostname we check. `domain` drops a leading www so the same site
 * shares one cache entry and one brand identity; `host` is what we fetch.
 */
export function parseDomainInput(input: string): DomainInputResult {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed) return { ok: false, error: "Enter your website's domain." };
	if (trimmed.length > 300) return { ok: false, error: "That doesn't look like a domain." };

	let hostname: string;
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return { ok: false, error: "Enter a website domain, like acme.com." };
		}
		hostname = url.hostname.replace(/\.$/, "");
	} catch {
		return { ok: false, error: "That doesn't look like a domain. Try something like acme.com." };
	}

	if (isIpLiteral(hostname)) return { ok: false, error: "Enter a domain name rather than an IP address." };

	const labels = hostname.split(".");
	const tld = labels.at(-1) ?? "";
	if (
		labels.length < 2 ||
		hostname.length > 253 ||
		!labels.every((label) => LABEL.test(label)) ||
		!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)
	) {
		return { ok: false, error: "That doesn't look like a domain. Try something like acme.com." };
	}
	if (PRIVATE_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
		return { ok: false, error: "That domain isn't reachable on the public internet." };
	}

	return { ok: true, domain: hostname.replace(/^www\./, ""), host: hostname };
}

function isIpLiteral(hostname: string): boolean {
	return hostname.startsWith("[") || /^\d+(\.\d+){0,3}$/.test(hostname) || parseIpv4(hostname) !== null;
}

function parseIpv4(address: string): number[] | null {
	const parts = address.split(".");
	if (parts.length !== 4) return null;
	const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
	return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

const PRIVATE_V4: [number[], number][] = [
	[[0, 0, 0, 0], 8], // "this" network
	[[10, 0, 0, 0], 8],
	[[100, 64, 0, 0], 10], // carrier-grade NAT
	[[127, 0, 0, 0], 8],
	[[169, 254, 0, 0], 16], // link-local, including cloud metadata endpoints
	[[172, 16, 0, 0], 12],
	[[192, 0, 0, 0], 24],
	[[192, 0, 2, 0], 24],
	[[192, 168, 0, 0], 16],
	[[198, 18, 0, 0], 15],
	[[198, 51, 100, 0], 24],
	[[203, 0, 113, 0], 24],
	[[224, 0, 0, 0], 4], // multicast
	[[240, 0, 0, 0], 4], // reserved and broadcast
];

function inV4Range(octets: number[], [base, bits]: [number[], number]): boolean {
	const toInt = (o: number[]) => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (toInt(octets) & mask) === (toInt(base) & mask);
}

function expandIpv6(address: string): number[] | null {
	let text = address.replace(/^\[|\]$/g, "").split("%")[0];
	const embedded = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
	if (embedded) {
		const v4 = parseIpv4(embedded[1]);
		if (!v4) return null;
		const hex = (n: number) => n.toString(16);
		text = `${text.slice(0, -embedded[1].length)}${hex((v4[0] << 8) | v4[1])}:${hex((v4[2] << 8) | v4[3])}`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return null;
	const parse = (part: string) =>
		part ? part.split(":").map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : -1)) : [];
	const head = parse(halves[0]);
	const rest = halves.length === 2 ? parse(halves[1]) : [];
	const missing = halves.length === 2 ? 8 - head.length - rest.length : 0;
	if (missing < 0) return null;
	const groups = [...head, ...Array(missing).fill(0), ...rest];
	return groups.length === 8 && groups.every((g) => g >= 0) ? groups : null;
}

/**
 * Whether an address resolved for a visitor-supplied domain points somewhere we
 * must never fetch from the server: loopback, private networks, link-local
 * (cloud metadata), and the other non-public ranges. Unparseable input counts
 * as private, so a surprise format fails closed.
 */
export function isPrivateAddress(address: string): boolean {
	const v4 = parseIpv4(address);
	if (v4) return PRIVATE_V4.some((range) => inV4Range(v4, range));
	const groups = expandIpv6(address);
	return groups === null || isPrivateIpv6(groups);
}

// First-group prefixes (value, mask) that are never public unicast.
const PRIVATE_V6_PREFIXES: [number, number][] = [
	[0xfc00, 0xfe00], // unique local
	[0xfe80, 0xffc0], // link-local
	[0xff00, 0xff00], // multicast
];

function isPrivateIpv6(groups: number[]): boolean {
	const embeddedV4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
	const zeroBefore = (n: number) => groups.slice(0, n).every((g) => g === 0);

	if (zeroBefore(7) && groups[7] <= 1) return true; // :: and ::1
	// IPv4-mapped, IPv4-compatible, and NAT64 addresses reach the embedded IPv4 host.
	if ((zeroBefore(5) && groups[5] === 0xffff) || zeroBefore(6) || (groups[0] === 0x64 && groups[1] === 0xff9b)) {
		return isPrivateAddress(embeddedV4);
	}
	if (PRIVATE_V6_PREFIXES.some(([prefix, mask]) => (groups[0] & mask) === prefix)) return true;
	if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation
	return groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0); // discard-only
}
