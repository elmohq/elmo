/**
 * Single ESM-accessible entry point for the `bloom-filters` package.
 *
 * The package ships as CommonJS, which ESM importers can't destructure
 * directly. Centralizing the `createRequire` interop here means:
 *   - both the build script (generate-marketplace-bloom.ts) and the runtime
 *     loader (marketplace-filter.ts) use the exact same class, so the
 *     serialized format they produce/consume can never drift
 *   - the constructor and its type share one name, so there's no
 *     value/type alias split to keep in sync
 *
 * NOTE: `marketplace-bloom.json` is produced by `generate-marketplace-bloom.ts`
 * and consumed via `BloomFilter.fromJSON()`. If `bloom-filters` changes its
 * serialization format, regenerate the JSON from that script — otherwise the
 * server silently loads an empty filter and flags nothing.
 */
import { createRequire } from "node:module";
import type { BloomFilter as BloomFilterType } from "bloom-filters";

const require = createRequire(import.meta.url);
const { BloomFilter: BloomFilterValue } = require("bloom-filters") as {
	BloomFilter: typeof BloomFilterType;
};

export const BloomFilter = BloomFilterValue;
export type BloomFilter = BloomFilterType;
