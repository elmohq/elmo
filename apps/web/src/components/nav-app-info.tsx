import { IconBrandGithub, IconWorld } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import type { ClientConfig } from "@workspace/config/types";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Version/website/github links are only meaningful for open-source self-host
	// and the public demo — whitelabel/cloud deployments hide them.
	if (mode !== "local" && mode !== "demo") return null;

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			<span className="flex-1 text-xs font-medium text-muted-foreground">
				v{__APP_VERSION__}
			</span>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<a href="https://www.elmohq.com/" target="_blank" rel="noreferrer" className={linkClass}>
							<IconWorld className="size-4" />
						</a>
					</TooltipTrigger>
					<TooltipContent>elmohq.com</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<a href="https://github.com/elmohq/elmo" target="_blank" rel="noreferrer" className={linkClass}>
							<IconBrandGithub className="size-4" />
						</a>
					</TooltipTrigger>
					<TooltipContent>View on GitHub</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
