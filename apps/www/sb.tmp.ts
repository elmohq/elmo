import { sortedCompetitors, getSoundbite } from "./src/lib/competitors";
for (const c of sortedCompetitors.slice(0, Number(process.argv[2] ?? 300))) console.log(`${c.slug}: ${getSoundbite(c)}`);
