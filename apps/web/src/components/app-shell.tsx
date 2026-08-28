import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import type { ReactNode } from "react";

/**
 * The frame every signed-in page renders in: the rail on the left, the header
 * and the page to the right of it.
 *
 * One copy, so no page can drift on the inset's geometry — which is easy to get
 * wrong in a way nothing tells you about, see the note on `overflow-clip` below.
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
 * The padded content region inside the shell, which most pages want and a gate
 * page — laying out its own full-height card — does not. Separate from
 * `AppShell` so opting out means leaving it off rather than passing a flag.
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
