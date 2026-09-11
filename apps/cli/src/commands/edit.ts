import { spawn } from "node:child_process";
import path from "node:path";
import { type DirOption, fileExists, resolveConfigDir } from "../config.js";
import { log } from "../util.js";

export async function runEdit(target: string, options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);

	let filePath: string;
	if (target === "env") {
		filePath = path.join(configDir, ".env");
	} else if (target === "compose") {
		filePath = path.join(configDir, "elmo.yaml");
	} else {
		throw new Error(`Unknown edit target: ${target}. Use \`env\` or \`compose\`.`);
	}

	if (!(await fileExists(filePath))) {
		throw new Error(`File not found: ${filePath}`);
	}

	const editorEnv = process.env.VISUAL || process.env.EDITOR || "nano";
	const parts = editorEnv.split(/\s+/).filter(Boolean);
	const cmd = parts[0] ?? "nano";
	const args = [...parts.slice(1), filePath];

	await new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit" });
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}`));
		});
		child.on("error", (err) => reject(err));
	});

	log.info("Restart the stack with `elmo compose up -d` to apply changes.");
}
