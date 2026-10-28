/** Scalar carries a whole Vue app; stories only need to know the slot is filled. */
export default function ApiReferenceMock({ url, darkMode }: { url: string; darkMode: boolean }) {
	return (
		<div className="p-6 text-sm text-muted-foreground" data-testid="api-reference-mock">
			API reference for {url} ({darkMode ? "dark" : "light"})
		</div>
	);
}
