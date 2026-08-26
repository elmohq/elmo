import { IconBrandGithub, IconScale, IconWorld } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { LEGAL_DOCUMENTS, legalUrl, showsLegalLinks } from "@workspace/config/legal";
import type { ClientConfig } from "@workspace/config/types";
import { openCookiePreferences } from "@workspace/ui/lib/cookie-consent";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Whitelabel deployments hide the version/website/github links.
	if (mode === "whitelabel") return null;

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			<a
				href={`https://github.com/elmohq/elmo/releases/tag/v${__APP_VERSION__}`}
				target="_blank"
				rel="noreferrer"
				className="flex-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
			>
				v{__APP_VERSION__}
			</a>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger render={<a href="https://www.elmohq.com/" target="_blank" className={linkClass} />}>
						<IconWorld className="size-4" />
					</TooltipTrigger>
					<TooltipContent>elmohq.com</TooltipContent>
				</Tooltip>
				{showsLegalLinks(mode) && (
					<DropdownMenu>
						<DropdownMenuTrigger className={linkClass} aria-label="Legal" title="Legal">
							<IconScale className="size-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" side="top" className="w-48">
							{LEGAL_DOCUMENTS.map((document) => (
								<DropdownMenuItem
									key={document.slug}
									render={<a href={legalUrl(document.slug)} target="_blank" rel="noreferrer" />}
								>
									{document.title}
								</DropdownMenuItem>
							))}
							{/* Only cloud gates anything on consent, so only cloud has a choice to revisit. */}
							{mode === "cloud" && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={openCookiePreferences}>Cookie preferences</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				<Tooltip>
					<TooltipTrigger
						render={<a href="https://github.com/elmohq/elmo" target="_blank" rel="noreferrer" className={linkClass} />}
					>
						<IconBrandGithub className="size-4" />
					</TooltipTrigger>
					<TooltipContent>View on GitHub</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
