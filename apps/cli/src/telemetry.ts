import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PostHog } from "posthog-node";

const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://us.i.posthog.com";
const CONFIG_HOME = path.join(os.homedir(), ".config", "elmo");
const CONFIG_FILE = path.join(CONFIG_HOME, "config.json");

interface TelemetryConfig {
	telemetryId?: string;
	telemetryDisabled?: boolean;
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

function envDisabled(): boolean {
	return Boolean(process.env.DISABLE_TELEMETRY);
}

export async function isTelemetryDisabled(): Promise<boolean> {
	if (envDisabled()) return true;
	const config = await readConfig();
	return config.telemetryDisabled === true;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
	const config = await readConfig();
	if (enabled) {
		delete config.telemetryDisabled;
	} else {
		config.telemetryDisabled = true;
	}
	await writeConfig(config);
}

export type TelemetryStatus = {
	enabled: boolean;
	source: "env" | "config" | "default";
	distinctId?: string;
};

export async function getTelemetryStatus(): Promise<TelemetryStatus> {
	if (envDisabled()) {
		return { enabled: false, source: "env" };
	}
	const config = await readConfig();
	if (config.telemetryDisabled === true) {
		return { enabled: false, source: "config", distinctId: config.telemetryId };
	}
	return { enabled: true, source: "default", distinctId: config.telemetryId };
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
	if (await isTelemetryDisabled()) return;

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
