/**
 * Two-column shell for the sign-in and sign-up pages: the form on the left, the
 * pitch on the right.
 *
 * Both columns are a single centred stack with the same padding, so the two
 * share a centre line and stay balanced whatever the pitch grows to. Pinning
 * the logo to the top and the footer to the bottom instead would centre the
 * form over a shorter band than the pitch, and the columns would visibly
 * disagree about where the page ends.
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

const COLUMN = "flex items-center justify-center px-6 py-12 sm:px-10 lg:px-12";

export function AuthSplitLayout({ title, subtitle, children, pitch, footer }: AuthSplitLayoutProps) {
	return (
		<div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
			<div className={COLUMN}>
				<div className="w-full max-w-sm">
					<Logo />
					<div className="mt-12">
						<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
						{subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
						<div className="mt-8">{children}</div>
					</div>
					{footer && <div className="mt-12">{footer}</div>}
				</div>
			</div>

			<aside className={`relative border-t bg-muted/40 lg:border-l lg:border-t-0 ${COLUMN}`}>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:48px_48px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
				/>
				<div className="relative w-full">{pitch}</div>
			</aside>
		</div>
	);
}
