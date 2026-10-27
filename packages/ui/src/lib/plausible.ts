import { classifyLinkClick } from "@workspace/config/referrals";

type PlausibleCommand = ((event: string, options?: { props?: Record<string, string> }) => void) & {
	q?: unknown[][];
};

declare global {
	interface Window {
		plausible?: PlausibleCommand;
	}
}

// Queue like the official snippet: a click can land before the deferred script loads.
function plausible(event: string, props: Record<string, string>): void {
	if (!window.plausible) {
		const queue: PlausibleCommand = (...args) => {
			queue.q = queue.q ?? [];
			queue.q.push(args);
		};
		window.plausible = queue;
	}
	window.plausible(event, { props });
}

function onClick(event: MouseEvent): void {
	if (event.type === "auxclick" && event.button !== 1) return;
	const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
	if (!(anchor instanceof HTMLAnchorElement)) return;
	const click = classifyLinkClick(anchor.href, window.location.href);
	if (click) plausible(click.goal, click.props);
}

export function trackLinkClickGoals(): () => void {
	document.addEventListener("click", onClick, { capture: true });
	document.addEventListener("auxclick", onClick, { capture: true });
	return () => {
		document.removeEventListener("click", onClick, { capture: true });
		document.removeEventListener("auxclick", onClick, { capture: true });
	};
}
