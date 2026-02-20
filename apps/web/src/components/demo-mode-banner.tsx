import { useRouteContext } from "@tanstack/react-router";
import { IconInfoCircle } from "@tabler/icons-react";
import type { ClientConfig } from "@workspace/config/types";

export function DemoModeBanner() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const isReadOnly = context.clientConfig?.features.readOnly ?? false;

	if (!isReadOnly) return null;

	return (
		<div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
			<div className="container mx-auto flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
				<IconInfoCircle className="h-4 w-4" />
				<span>
					<strong>Demo Mode</strong> — This is a read-only demo. Write operations are disabled.
				</span>
			</div>
		</div>
	);
}
