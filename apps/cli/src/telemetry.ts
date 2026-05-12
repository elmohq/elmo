import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import { PostHog } from "posthog-node";

const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://us.i.posthog.com";

function envDisabled(): boolean {
	return Boolean(process.env.DISABLE_TELEMETRY);
}

async function readEnvKey(configDir: string, key: string): Promise<string | undefined> {
	try {
		const contents = await fs.readFile(path.join(configDir, ".env"), "utf8");
		return parse(contents)[key];
	} catch {
		return undefined;
	}
}

async function isTelemetryDisabled(configDir: string): Promise<boolean> {
	if (envDisabled()) return true;
	return Boolean(await readEnvKey(configDir, "DISABLE_TELEMETRY"));
}

export async function trackCliEvent(
	configDir: string,
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
	personProperties?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
	if (await isTelemetryDisabled(configDir)) return;
	const distinctId = await readEnvKey(configDir, "DEPLOYMENT_ID");
	if (!distinctId) return;

	try {
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

// Newsletter signup is an explicit user action with clear intent, so it
// fires even when anonymous telemetry is disabled. When telemetry is on the
// event is keyed off the deployment UUID and the email is attached as a
// person property — same identity as the rest of the CLI events. When
// telemetry is off the event is keyed off the email itself, so it is never
// linked back to the anonymous deployment UUID.
export async function submitNewsletterSignup(configDir: string, email: string): Promise<void> {
	try {
		const disabled = await isTelemetryDisabled(configDir);
		const deploymentId = disabled ? null : await readEnvKey(configDir, "DEPLOYMENT_ID");
		const distinctId = deploymentId ?? email;
		const client = new PostHog(POSTHOG_PUBLIC_KEY, { host: POSTHOG_HOST });
		client.capture({
			distinctId,
			event: "newsletter_signup",
			properties: { source: "cli_init" },
			...{ $set: { $email: email, wants_updates: true } },
		});
		await client.shutdown();
	} catch {
		// Newsletter signup should never block the CLI
	}
}
