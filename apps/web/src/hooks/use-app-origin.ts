import { useEffect, useState } from "react";
import { useBranding } from "@/hooks/use-deployment-features";

/**
 * Where this instance answers, for the URLs we hand people to paste elsewhere.
 * Prefers the configured app URL so the server renders the same string the
 * client does; an instance that never set one falls back to the browser.
 */
export function useAppOrigin(): string {
	const configured = useBranding()?.url?.replace(/\/$/, "");
	const [origin, setOrigin] = useState(configured ?? "");

	useEffect(() => {
		if (!configured) setOrigin(window.location.origin);
	}, [configured]);

	return origin;
}
