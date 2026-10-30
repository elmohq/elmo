import { v4 } from "uuid";
import { BRAND_DATA_DB_PREFIX, BRAND_DATA_FORMAT } from "@/lib/brand-data/chunks";
import type { Job } from "@/lib/brand-data/worker/protocol";
import type { SyncState } from "@/lib/brand-data/worker/sync";

const NAME = `${BRAND_DATA_DB_PREFIX}-v${BRAND_DATA_FORMAT}`;
/** How long a job waits for the leading tab to take it before this tab answers it alone. */
const ACK_TIMEOUT_MS = 5_000;

type Message =
	| { type: "job"; from: string; id: number; job: Job }
	| { type: "ack"; to: string; id: number }
	| { type: "reply"; to: string; id: number; value?: unknown; error?: string }
	| { type: "status"; brandId: string; state: SyncState }
	| { type: "leader" };

interface Pending {
	job: Job;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer?: ReturnType<typeof setTimeout>;
}

/**
 * Lets every tab share one engine, so the brand data is synced and stored once. The tab holding the Web Lock
 * runs jobs; the others pass theirs over a broadcast channel. When it closes, a waiting tab takes the lock and
 * the others resend whatever it hadn't answered. If the leading tab stops answering, as a frozen background tab
 * may, a tab runs the job itself, with its own copy in memory.
 */
export function shareAcrossTabs(options: {
	run: (job: Job) => Promise<unknown>;
	onStatus: (brandId: string, state: SyncState) => void;
}) {
	const channel = new BroadcastChannel(NAME);
	const tab = v4();
	const pending = new Map<number, Pending>();
	let leading = false;
	let alone = false;
	let nextId = 0;

	const runHere = (id: number) => {
		const request = pending.get(id);
		if (!request) return;
		pending.delete(id);
		clearTimeout(request.timer);
		options.run(request.job).then(request.resolve, request.reject);
	};

	const send = (id: number) => {
		const request = pending.get(id);
		if (!request) return;
		if (leading || alone) return runHere(id);
		clearTimeout(request.timer);
		request.timer = setTimeout(() => {
			alone = true;
			runHere(id);
		}, ACK_TIMEOUT_MS);
		channel.postMessage({ type: "job", from: tab, id, job: request.job } satisfies Message);
	};

	const answer = (message: Extract<Message, { type: "job" }>) => {
		channel.postMessage({ type: "ack", to: message.from, id: message.id } satisfies Message);
		const reply = (body: { value?: unknown; error?: string }) =>
			channel.postMessage({ type: "reply", to: message.from, id: message.id, ...body } satisfies Message);
		options.run(message.job).then(
			(value) => reply({ value }),
			(error: Error) => reply({ error: error.message }),
		);
	};

	const settle = (message: Extract<Message, { type: "reply" }>) => {
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.error === undefined) request?.resolve(message.value);
		else request?.reject(new Error(message.error));
	};

	const handlers: { [T in Message["type"]]: (message: Extract<Message, { type: T }>) => void } = {
		job: (message) => leading && answer(message),
		ack: (message) => message.to === tab && clearTimeout(pending.get(message.id)?.timer),
		reply: (message) => message.to === tab && settle(message),
		status: (message) => options.onStatus(message.brandId, message.state),
		leader: () => {
			for (const id of pending.keys()) send(id);
		},
	};
	channel.onmessage = ({ data: message }: MessageEvent<Message>) =>
		(handlers[message.type] as (message: Message) => void)(message);

	void navigator.locks.request(NAME, () => {
		leading = true;
		channel.postMessage({ type: "leader" } satisfies Message);
		for (const id of pending.keys()) runHere(id);
		return new Promise(() => {});
	});

	return {
		submit(job: Job): Promise<unknown> {
			const id = nextId++;
			const done = new Promise((resolve, reject) => pending.set(id, { job, resolve, reject }));
			send(id);
			return done;
		},
		/** The engine's status, for this tab and, when leading, every other. */
		status(brandId: string, state: SyncState) {
			options.onStatus(brandId, state);
			if (leading) channel.postMessage({ type: "status", brandId, state } satisfies Message);
		},
	};
}
