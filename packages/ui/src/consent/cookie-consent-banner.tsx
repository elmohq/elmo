import { useEffect, useState } from "react";
import { Switch } from "@workspace/ui/components/switch";
import {
	ACCEPT_ALL,
	CONSENT_OPEN_EVENT,
	type CookieConsent,
	readConsent,
	REJECT_ALL,
	resolveConsent,
	saveConsent,
} from "@workspace/ui/lib/cookie-consent";

const CATEGORIES: { key: keyof CookieConsent; label: string; description: string }[] = [
	{
		key: "analytics",
		label: "Analytics",
		description: "How people find and use the product. Our main web analytics is cookieless either way.",
	},
	{
		key: "marketing",
		label: "Advertising",
		description: "Whether an ad we paid for actually led somewhere.",
	},
];

const buttonBase =
	"rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Cookie consent banner.
 *
 * Only mounts client-side, so it never appears in the SSR HTML and can't shift
 * layout, and it carries no third-party CMP — the whole thing is this file plus
 * two booleans in localStorage.
 *
 * `consentRequired` decides whether it appears unprompted. Wherever consent
 * isn't required the banner stays hidden until something dispatches
 * CONSENT_OPEN_EVENT, which is what a "Cookie preferences" link does.
 */
export function CookieConsentBanner({ consentRequired, policyHref }: { consentRequired: boolean; policyHref: string }) {
	const [open, setOpen] = useState(false);
	const [choice, setChoice] = useState<CookieConsent>(REJECT_ALL);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (consentRequired && readConsent() === null) {
			setChoice(REJECT_ALL);
			setOpen(true);
		}

		const reopen = () => {
			setChoice(readConsent() ?? resolveConsent(null, consentRequired));
			setExpanded(true);
			setOpen(true);
		};
		window.addEventListener(CONSENT_OPEN_EVENT, reopen);
		return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
	}, [consentRequired]);

	if (!open) return null;

	function commit(consent: CookieConsent) {
		saveConsent(consent);
		setOpen(false);
		setExpanded(false);
	}

	return (
		<div
			role="region"
			aria-label="Cookie consent"
			className="fixed inset-x-3 bottom-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-sm"
		>
			<div className="rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
				<p className="text-[13px] leading-relaxed">
					We'd like to set analytics and advertising cookies to see how people find Elmo. Essential cookies are always
					on.{" "}
					<a href={policyHref} className="underline underline-offset-2 hover:text-primary">
						Cookie Policy
					</a>
				</p>

				{expanded && (
					<ul className="mt-3 space-y-2.5 border-t pt-3">
						{CATEGORIES.map((category) => (
							<li key={category.key} className="flex items-start gap-3">
								<Switch
									id={`consent-${category.key}`}
									checked={choice[category.key]}
									onCheckedChange={(checked) => setChoice((prev) => ({ ...prev, [category.key]: checked }))}
									className="mt-0.5"
								/>
								<label htmlFor={`consent-${category.key}`} className="text-[13px] leading-snug">
									<span className="font-medium">{category.label}</span>
									<span className="block text-muted-foreground">{category.description}</span>
								</label>
							</li>
						))}
					</ul>
				)}

				<div className="mt-3.5 flex items-center gap-2">
					<button
						type="button"
						onClick={() => commit(ACCEPT_ALL)}
						className={`${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`}
					>
						Accept
					</button>
					<button type="button" onClick={() => commit(REJECT_ALL)} className={`${buttonBase} border hover:bg-accent`}>
						Reject
					</button>
					{expanded ? (
						<button
							type="button"
							onClick={() => commit(choice)}
							className={`${buttonBase} ml-auto text-muted-foreground hover:text-foreground`}
						>
							Save choices
						</button>
					) : (
						<button
							type="button"
							onClick={() => setExpanded(true)}
							className={`${buttonBase} ml-auto text-muted-foreground hover:text-foreground`}
						>
							Choose
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
