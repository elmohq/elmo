import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import pc from "picocolors";
import { parseAppUrl, setEnvValues } from "../app-url.js";
import { type DirOption, resolveConfigDir } from "../config.js";
import { log } from "../util.js";

export async function runUrl(input: string | undefined, options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	const envPath = path.join(configDir, ".env");
	const contents = await fs.readFile(envPath, "utf8");

	if (input === undefined) {
		console.log(parseDotenv(contents).APP_URL ?? "");
		return;
	}

	const result = parseAppUrl(input);
	if ("error" in result) {
		throw new Error(`${result.error}: ${input}`);
	}

	await fs.writeFile(envPath, setEnvValues(contents, { APP_URL: result.url, VITE_APP_URL: result.url }), "utf8");
	log.success(`Public URL set to ${pc.cyan(result.url)}`);
	log.info("Restart the stack with `elmo compose up -d` to apply changes.");
}
