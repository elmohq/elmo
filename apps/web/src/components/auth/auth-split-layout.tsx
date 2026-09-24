/**
 * Two-column shell for the sign-in and sign-up pages: the form on the left, the
 * pitch on the right.
 *
 * Both columns fill the same vertical band, tall enough for the longest form
 * either page renders, and centred in the viewport. Within it the logo and the
 * headline start at the top edge and the footer and the offer card finish at
 * the bottom, so the two columns agree on where the page begins and ends —
 * and moving between sign-in and sign-up leaves everything but the form itself
 * where it was.
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

/**
 * Cloud sign-up is the longest thing either column holds, so it sets the band.
 * A field-level error can still outgrow it; the columns drift by half that and
 * settle back once it clears.
 */
const BAND = "flex w-full flex-col lg:min-h-[39rem]";

export function AuthSplitLayout({ title, subtitle, children, pitch, footer }: AuthSplitLayoutProps) {
	return (
		<div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
			<div className={COLUMN}>
				<div className={`${BAND} max-w-sm`}>
					<Logo />
					<div className="flex flex-1 items-center py-10">
						<div className="w-full">
							<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
							{subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
							<div className="mt-8">{children}</div>
						</div>
					</div>
					{footer}
				</div>
			</div>

			<aside className={`relative border-t bg-muted/40 lg:border-l lg:border-t-0 ${COLUMN}`}>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:48px_48px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
				/>
				<div className={`relative mx-auto ${BAND} max-w-lg`}>{pitch}</div>
			</aside>
		</div>
	);
}
