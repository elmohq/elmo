/**
 * Turning whatever someone pastes into a URL we are willing to fetch.
 *
 * These tools fetch a URL the visitor supplies, which makes the server a
 * potential proxy into anything it can reach. Everything here is the first half
 * of the defense — syntax, scheme, and address-range checks. The second half
 * (resolving the hostname and re-checking every redirect hop) lives in
 * fetch-remote.ts, because it needs DNS.
 *
 * Pure: no network, no Node built-ins.
 */

/** An error whose message is safe to show the visitor verbatim. */
export class ToolError extends Error {}

/**
 * Hostnames that never point anywhere public. `.local`/`.internal` and friends
 * are reserved for private networks, and a hostname with no dot is a LAN name.
 */
const BLOCKED_TLDS = ["local", "localhost", "internal", "intranet", "corp", "home", "lan", "test", "invalid", "onion"];

export function isBlockedHostname(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/\.$/, "");
	if (!host) return true;
	if (!host.includes(".")) return true;
	if (host.endsWith(".home.arpa") || host.endsWith(".in-addr.arpa") || host.endsWith(".ip6.arpa")) return true;
	const tld = host.slice(host.lastIndexOf(".") + 1);
	return BLOCKED_TLDS.includes(tld);
}

function ipv4ToNumber(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const octet = Number(part);
		if (octet > 255) return null;
		value = value * 256 + octet;
	}
	return value;
}

/** CIDR blocks that are not routable on the public internet. */
const PRIVATE_V4_BLOCKS: [string, number][] = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16], // link-local, including cloud metadata at 169.254.169.254
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
];

export function isPrivateAddress(address: string): boolean {
	const ip = address
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.split("%")[0];
	if (!ip) return true;

	if (ip.includes(":")) {
		// IPv4-mapped and IPv4-compatible forms smuggle a v4 address through v6.
		const embedded = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
		if (embedded) return isPrivateAddress(embedded[1]);
		if (ip === "::" || ip === "::1") return true;
		const head = ip.split(":")[0];
		if (!head) return true; // "::something" — unspecified prefix
		const group = Number.parseInt(head, 16);
		if (Number.isNaN(group)) return true;
		if ((group & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
		if ((group & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
		if ((group & 0xff00) === 0xff00) return true; // ff00::/8 multicast
		return false;
	}

	const value = ipv4ToNumber(ip);
	if (value === null) return true;
	return PRIVATE_V4_BLOCKS.some(([base, bits]) => {
		const baseValue = ipv4ToNumber(base);
		if (baseValue === null) return false;
		const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
		return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
	});
}

export function isIpLiteral(hostname: string): boolean {
	const host = hostname.replace(/^\[|\]$/g, "");
	return host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Accepts "example.com", "example.com/blog", or a full URL, and returns the URL
 * we will actually request. Throws ToolError with a message meant for the
 * visitor.
 */
export function normalizeSiteUrl(input: string): URL {
	const trimmed = input.trim();
	if (!trimmed) throw new ToolError("Enter a domain, like example.com");
	if (/\s/.test(trimmed)) throw new ToolError("That does not look like a domain — remove the spaces and try again.");

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new ToolError(`Could not read "${trimmed}" as a domain.`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new ToolError("Only http and https addresses can be checked.");
	}
	if (url.username || url.password) {
		throw new ToolError("Remove the credentials from the URL and try again.");
	}
	if (isIpLiteral(url.hostname)) {
		throw new ToolError("Enter a domain name rather than an IP address.");
	}
	if (isBlockedHostname(url.hostname)) {
		throw new ToolError(`"${url.hostname}" is not a public domain.`);
	}

	url.hash = "";
	return url;
}
