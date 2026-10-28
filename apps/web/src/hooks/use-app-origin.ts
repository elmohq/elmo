import { useEffect, useState } from "react";
import { useBranding } from "@/hooks/use-deployment-features";

/**
 * Where this instance answers, for the URLs we hand people to paste elsewhere.
 * The configured app URL renders first so the server and the first client pass
 * agree, then the browser's own origin takes over — a deployment that never set
 * APP_URL would otherwise tell everyone to call localhost.
 */
export function useAppOrigin(): string {
	const configured = useBranding()?.url?.replace(/\/$/, "");
	const [origin, setOrigin] = useState(configured ?? "");

	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);

	return origin;
}
