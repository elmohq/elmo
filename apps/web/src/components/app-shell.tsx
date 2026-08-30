import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import type { ReactNode } from "react";

/**
 * The frame every signed-in page renders in. One copy, so no page drifts on the
 * inset's geometry — see the note on `overflow-clip` below for how quietly that
 * goes wrong.
 */
export function AppShell({
	sidebar,
	header,
	children,
}: {
	sidebar: ReactNode;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<SidebarProvider>
			{sidebar}
			{/* `overflow-clip` rather than `overflow-hidden`: both clip to the rounded
			    corners, but `hidden` makes this a scroll container, which stops
			    descendants from sticking to the viewport (the site header included). */}
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				{header}
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

/**
 * Separate from `AppShell` so a gate page, which lays out its own full-height
 * card, opts out by leaving it off rather than passing a flag.
 */
export function PageContent({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-1 flex-col">
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
			</div>
		</div>
	);
}
