import { competitors } from "./src/lib/competitors/data";
const slugs = process.argv.slice(2);
for (const c of competitors.filter((c) => slugs.includes(c.slug))) console.log(c.slug, "|", c.description, "\n   ", JSON.stringify(c.highlights), c.notes ?? "");
