import { useRouteContext } from "@tanstack/react-router";
import { IconInfoCircle } from "@tabler/icons-react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@workspace/ui/components/sidebar";
import type { ClientConfig } from "@workspace/config/types";

interface DemoModeBannerProps {
	variant?: "page" | "sidebar";
}

export function DemoModeBanner({ variant = "page" }: DemoModeBannerProps = {}) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const isReadOnly = context.clientConfig?.features.readOnly ?? false;

	if (!isReadOnly) return null;

	if (variant === "sidebar") {
		return (
			<SidebarGroup>
				<SidebarGroupLabel>Demo Mode</SidebarGroupLabel>
				<SidebarGroupContent>
					<p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
						Edits will fail. Only reading data is supported.
					</p>
				</SidebarGroupContent>
			</SidebarGroup>
		);
	}

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
