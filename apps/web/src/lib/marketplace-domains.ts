// Pay-to-win link marketplaces — sites that sell placements to anyone willing
// to pay, so a citation from one says more about a budget than about authority.
//
// Server-only, like the editorial set in `domain-categories.server.ts`: the
// membership set is a bloom filter so publishing the app doesn't republish a
// scraped marketplace inventory, and it's imported (not read from disk) so a
// deployment can't lose the asset and silently stop flagging anything.
//
// Regenerate `marketplace-domains.gen.json` with
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
