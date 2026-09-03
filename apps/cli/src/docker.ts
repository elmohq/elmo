import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { log, sleep } from "./util.js";

type ComposeService = {
	Service: string;
	State: string;
	Health?: string;
	ExitCode?: number;
};

async function getComposeServices(configDir: string): Promise<ComposeService[]> {
	const output = await runDockerComposeCapture(configDir, ["ps", "--format", "json"]);
	if (!output.trim()) {
		return [];
	}
	try {
		const trimmed = output.trim();
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed)) {
			return parsed as ComposeService[];
		}
		if (typeof parsed === "object" && parsed !== null) {
			return [parsed as ComposeService];
		}
		return [];
	} catch {
		try {
			return output
				.trim()
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => JSON.parse(line) as ComposeService);
		} catch {
			log.warn("Unable to parse docker compose status.");
			return [];
		}
	}
}

function isServiceReady(service: ComposeService): boolean {
	if (service.Health) {
		return service.Health === "healthy";
	}
	if (service.State?.startsWith("running")) {
		return true;
	}
	return false;
}

export async function waitForHealthy(configDir: string, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const services = await getComposeServices(configDir);
		if (services.length > 0 && services.every(isServiceReady)) {
			return true;
		}
		await sleep(3000);
	}
	return false;
}

export async function stackHasRunningServices(configDir: string): Promise<boolean> {
	try {
		const services = await getComposeServices(configDir);
		return services.some((s) => s.State?.startsWith("running") ?? false);
	} catch {
		return false;
	}
}

export async function composeUsesBuild(composePath: string): Promise<boolean> {
	try {
		const contents = await fs.readFile(composePath, "utf8");
		return /^\s*build:/m.test(contents);
	} catch {
		return false;
	}
}

export function runDockerCompose(configDir: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = ["compose", "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs, {
			stdio: "inherit",
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`docker compose exited with code ${code}`));
			}
		});
	});
}

function runDockerComposeCapture(configDir: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = ["compose", "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(stderr || `docker compose exited with code ${code}`));
			}
		});
	});
}

export function assertDockerRunning(): void {
	const result = spawnSync("docker", ["info"], {
		stdio: "ignore",
	});
	if (result.status !== 0) {
		throw new Error("Docker does not appear to be running. Start Docker and try again.");
	}
}
