import { PostHog } from "posthog-node";

const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;

function isTelemetryDisabled(): boolean {
	return Boolean(process.env.DISABLE_TELEMETRY);
}

function getClient(): PostHog | null {
	if (isTelemetryDisabled()) return null;
	if (!process.env.DEPLOYMENT_ID) return null;
	if (client) return client;
	client = new PostHog(POSTHOG_PUBLIC_KEY, {
		host: POSTHOG_HOST,
		flushAt: 20,
		flushInterval: 30_000,
	});
	return client;
}

export function trackWorkerEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | string[] | undefined>,
): void {
	const ph = getClient();
	if (!ph) return;

	try {
		ph.capture({
			distinctId: `deployment:${process.env.DEPLOYMENT_ID}`,
			event: eventName,
			properties: {
				deployment_mode: process.env.DEPLOYMENT_MODE ?? "local",
				...properties,
			},
		});
	} catch {
		// Telemetry must never interfere with job processing
	}
}

export async function shutdownTelemetry(): Promise<void> {
	if (client) {
		await client.shutdown();
		client = null;
	}
}
