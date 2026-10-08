const CAL_ORIGIN = "https://app.cal.com";
const CAL_EMBED_SCRIPT = `${CAL_ORIGIN}/embed/embed.js`;

/** Hosts the embed loads from, for the Content-Security-Policy. */
export const CAL_EMBED_CSP = CAL_ORIGIN;

type CalCommand = (...args: unknown[]) => void;
type CalQueue = CalCommand & { q: unknown[][]; loaded?: boolean; ns: Record<string, CalCommand> };

declare global {
	interface Window {
		Cal?: CalQueue;
	}
}

interface CalEvent<T> {
	detail: { data: T };
}

// Like Cal.com's own snippet, every command queues until embed.js arrives and
// replays them.
function cal(...args: unknown[]): void {
	if (!window.Cal) {
		const queue = ((...queued: unknown[]) => {
			queue.q.push(queued);
		}) as CalQueue;
		queue.q = [];
		queue.ns = {};
		window.Cal = queue;
	}
	if (!window.Cal.loaded) {
		window.Cal.loaded = true;
		const script = document.createElement("script");
		script.src = CAL_EMBED_SCRIPT;
		script.async = true;
		document.head.appendChild(script);
	}
	window.Cal(...args);
}

interface InlineBookingOptions {
	element: HTMLElement;
	calLink: string;
	/** Passed through to the booking as query parameters. */
	params?: Record<string, string>;
	onBooked: (bookingUid: string) => void;
}

export function embedInlineBooking({ element, calLink, params, onBooked }: InlineBookingOptions): void {
	cal("init", { origin: CAL_ORIGIN });
	cal("inline", { elementOrSelector: element, calLink, config: { layout: "month_view", ...params } });
	cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
	// The V2 event only fires for real bookings; test-mode ones get their own.
	cal("on", {
		action: "bookingSuccessfulV2",
		callback: (event: CalEvent<{ uid?: string }>) => {
			const { uid } = event.detail.data;
			if (uid) onBooked(uid);
		},
	});
}
