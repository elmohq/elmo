// Resolves once the page has loaded and the main thread goes idle, for
// third-party scripts that shouldn't compete with the page's own resources.
export function afterPageIdle(): Promise<void> {
	return new Promise((resolve) => {
		const schedule = () => {
			if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 3000 });
			else setTimeout(resolve, 0);
		};
		if (document.readyState === "complete") schedule();
		else window.addEventListener("load", schedule, { once: true });
	});
}
