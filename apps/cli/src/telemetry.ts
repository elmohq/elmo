import { PostHog } from "posthog-node";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://us.i.posthog.com";
const CONFIG_HOME = path.join(os.homedir(), ".config", "elmo");
const CONFIG_FILE = path.join(CONFIG_HOME, "config.json");

function isTelemetryDisabled(): boolean {
	return Boolean(process.env.DISABLE_TELEMETRY);
}

interface TelemetryConfig {
	telemetryId?: string;
	[key: string]: unknown;
}

async function readConfig(): Promise<TelemetryConfig> {
	try {
		const contents = await fs.readFile(CONFIG_FILE, "utf8");
		return JSON.parse(contents) as TelemetryConfig;
	} catch {
		return {};
	}
}

async function writeConfig(config: TelemetryConfig): Promise<void> {
	await fs.mkdir(CONFIG_HOME, { recursive: true });
	await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

async function getOrCreateDistinctId(): Promise<string> {
	const config = await readConfig();
	if (config.telemetryId) return config.telemetryId;

	const id = crypto.randomUUID();
	await writeConfig({ ...config, telemetryId: id });
	return id;
}

export async function trackCliEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
	personProperties?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
	if (isTelemetryDisabled()) return;

	try {
		const distinctId = await getOrCreateDistinctId();
		const client = new PostHog(POSTHOG_PUBLIC_KEY, { host: POSTHOG_HOST });

		client.capture({
			distinctId,
			event: eventName,
			properties,
			...(personProperties ? { $set: personProperties } : {}),
		});

		await client.shutdown();
	} catch {
		// Telemetry should never block the CLI
	}
}
