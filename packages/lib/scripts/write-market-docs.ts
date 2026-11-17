import { readFileSync, writeFileSync } from "node:fs";
import { withMarketSupport } from "../src/markets/docs";

const path = new URL("../../docs/content/docs/user-guide/markets.mdx", import.meta.url);
writeFileSync(path, withMarketSupport(readFileSync(path, "utf8")));
