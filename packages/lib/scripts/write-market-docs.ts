import { readFileSync, writeFileSync } from "node:fs";
import { withMarketSupport } from "../src/markets/docs";

const path = new URL("../../docs/content/docs/user-guide/countries-and-languages.mdx", import.meta.url);
writeFileSync(path, withMarketSupport(readFileSync(path, "utf8")));
