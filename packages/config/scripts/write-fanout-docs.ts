import { readFileSync, writeFileSync } from "node:fs";
import { withFanoutSupport } from "../src/fanout-support-docs";

const path = new URL("../../docs/content/docs/user-guide/providers.mdx", import.meta.url);
writeFileSync(path, withFanoutSupport(readFileSync(path, "utf8")));
