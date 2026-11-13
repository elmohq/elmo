import { IconUserScan } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@workspace/lib/auth/client";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { viewerQuery } from "@/lib/viewer/queries";

/**
 * Reads the viewer from the query cache rather than route context so it stays
 * on screen for pages that render outside the signed-in layout, such as a 404.
 */
export function ImpersonationBanner() {
	const { data: viewer } = useQuery({ ...viewerQuery, enabled: false });
	const [stopping, setStopping] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!viewer?.impersonating) return null;
	const { user } = viewer.session;
	const label = user.email || user.name || "another user";

	const stop = async () => {
		setStopping(true);
		setError(null);
		const result = await authClient.admin.stopImpersonating();
		if (result.error) {
			setError(result.error.message || "Couldn't stop impersonating");
			setStopping(false);
			return;
		}
		// A full load, so nothing fetched as the impersonated user survives.
		window.location.assign("/admin/users");
	};

	return (
		<div
			role="status"
			className="fixed top-2 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-500/40 bg-amber-50 py-1 pr-1 pl-3 text-sm text-amber-900 shadow-lg"
		>
			<IconUserScan className="size-4 shrink-0" />
			<span className="truncate">
				{error ?? (
					<>
						Viewing as <strong className="font-medium">{label}</strong>
					</>
				)}
			</span>
			<Button
				size="sm"
				variant="outline"
				onClick={stop}
				disabled={stopping}
				className="shrink-0 cursor-pointer rounded-full bg-white"
			>
				{stopping && <Spinner />}
				Stop Impersonating
			</Button>
		</div>
	);
}
