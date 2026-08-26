/**
 * Two-column shell for the sign-in and sign-up pages: the form on the left, the
 * pitch on the right.
 *
 * The pitch stacks under the form on a narrow screen rather than being dropped,
 * so a phone still gets the argument — just after the thing it came to do.
 */

import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

interface AuthSplitLayoutProps {
	title: string;
	subtitle?: string;
	children: ReactNode;
	/** The sales panel. Rendered beside the form on wide screens, beneath it otherwise. */
	pitch: ReactNode;
	/** Small print under the form. */
	footer?: ReactNode;
}

export function AuthSplitLayout({ title, subtitle, children, pitch, footer }: AuthSplitLayoutProps) {
	return (
		<div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
			<div className="flex flex-col px-6 py-10 sm:px-10 lg:px-12">
				<div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
					<Logo />
					<div className="flex flex-1 items-center py-12">
						<div className="w-full">
							<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
							{subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
							<div className="mt-8">{children}</div>
						</div>
					</div>
					{footer}
				</div>
			</div>

			<aside className="relative flex flex-col justify-center border-t bg-muted/40 px-6 py-12 sm:px-10 lg:border-l lg:border-t-0 lg:px-12">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:48px_48px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
				/>
				<div className="relative">{pitch}</div>
			</aside>
		</div>
	);
}
