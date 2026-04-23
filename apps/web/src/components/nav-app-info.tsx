import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Version/website/github links are only meaningful for open-source self-host
	// and the public demo — whitelabel/cloud deployments hide them.
	if (mode !== "local" && mode !== "demo") return null;

	const linkClass = "text-muted-foreground hover:text-foreground transition-colors";

	return (
		<div className="flex items-center justify-center gap-1.5 px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">
			<span className="font-mono">v{__APP_VERSION__}</span>
			<span className="text-muted-foreground/50">·</span>
			<a href="https://www.elmohq.com/" target="_blank" rel="noreferrer" className={linkClass}>
				elmohq.com
			</a>
			<span className="text-muted-foreground/50">·</span>
			<a href="https://github.com/elmohq/elmo" target="_blank" rel="noreferrer" className={linkClass}>
				GitHub
			</a>
		</div>
	);
}
