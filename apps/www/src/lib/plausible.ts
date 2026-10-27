declare global {
	interface Window {
		plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
	}
}

export function trackPlausible(event: string, props?: Record<string, string>): void {
	window.plausible?.(event, props ? { props } : undefined);
}
