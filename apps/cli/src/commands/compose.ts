import { type DirOption, resolveConfigDir } from "../config.js";
import { assertDockerRunning, runDockerCompose } from "../docker.js";

export async function runCompose(args: string[], options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();
	await runDockerCompose(configDir, args);
}
