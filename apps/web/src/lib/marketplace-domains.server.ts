// Pay-to-win link marketplaces — sites that sell placements to anyone willing
// to pay, so a citation from one says more about a budget than about authority.
//
// This is a flag rather than a `CitationCategory`, so it sits beside
// `domain-categories.server.ts` instead of inside it: a marketplace domain
// still has whatever category it earned, and the classifier stays free of the
// bloom filter dependency.
//
// Server-only for the same reason that file is: the filter and the library that
// reads it are together ~800KB, which has no business in a browser bundle when
// the client only ever needs the resulting boolean.
//
// The membership set is a bloom filter so shipping the app doesn't also ship a
// republishable copy of the marketplaces' inventory, and it's imported rather
// than read from disk so a deployment can't misplace the asset and silently
// stop flagging anything. Regenerate it with
// `scripts/generate-marketplace-bloom.ts` when the marketplace exports change.
import { BloomFilter } from "bloom-filters";
import bloom from "./marketplace-domains.gen.json";

// `bloom-filters` declares `fromJSON(json: JSON): any` — that's the global
// `JSON` interface, which no deserialized value can satisfy. Pin the real
// contract once here so nothing downstream has to cast.
const fromJSON = BloomFilter.fromJSON as (json: unknown) => BloomFilter;

const MARKETPLACE_DOMAINS = fromJSON(bloom);

/**
 * Marketplaces sell placements per registrable domain, so this matches the
 * domain exactly rather than walking parent suffixes the way `inDomainSet`
 * does — every extra lookup against a probabilistic set is another chance to
 * mislabel an innocent domain.
 */
export function isMarketplaceDomain(domain: string): boolean {
	return MARKETPLACE_DOMAINS.has(domain.toLowerCase());
}
