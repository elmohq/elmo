import { IconBrandGithub, IconLink } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { SidebarMenu, SidebarMenuItem } from "@workspace/ui/components/sidebar";
import type { ClientConfig } from "@workspace/config/types";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Version/website/github links are only meaningful for open-source self-host
	// and the public demo — whitelabel/cloud deployments hide them.
	if (mode !== "local" && mode !== "demo") return null;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<div className="flex w-full items-center gap-2 rounded-md px-2 py-2 pb-0 mb-0">
					<div className="grid flex-1 text-left text-xs leading-tight">
						<span className="text-muted-foreground font-medium">
							v{__APP_VERSION__}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<a
							href="https://www.elmohq.com/"
							target="_blank"
							rel="noreferrer"
							className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors"
							title="elmohq.com"
						>
							<IconLink className="size-4" />
						</a>
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noreferrer"
							className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors"
							title="View on GitHub"
						>
							<IconBrandGithub className="size-4" />
						</a>
					</div>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
