/**
 * The logo for a brand, competitor, or cited domain, with its initials as the
 * fallback. Square-ish rather than circular: these are site icons, not people.
 *
 * Decorative by design — every surface renders the name alongside it, so the
 * mark carries no information a screen reader would otherwise miss.
 */
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";
import { faviconUrl, logoInitials } from "@/lib/brand-logo";

export type BrandLogoSize = "xs" | "sm" | "md" | "lg";

// `request` is the pixel size asked of the favicon service — 2x the rendered
// box, so the icon stays sharp on retina displays.
const SIZES: Record<BrandLogoSize, { box: string; text: string; request: number }> = {
	xs: { box: "size-4", text: "text-[8px]", request: 32 },
	sm: { box: "size-5", text: "text-[9px]", request: 64 },
	md: { box: "size-6", text: "text-[10px]", request: 64 },
	lg: { box: "size-8", text: "text-xs", request: 64 },
};

export function BrandLogo({
	name,
	domain,
	size = "sm",
	className,
}: {
	/** Display name — the initials fallback is derived from it. */
	name: string;
	/** Domain or website URL. Without one, the logo is initials only. */
	domain?: string | null;
	size?: BrandLogoSize;
	className?: string;
}) {
	const { box, text, request } = SIZES[size];
	const src = faviconUrl(domain, request);

	return (
		<Avatar aria-hidden="true" className={cn("shrink-0 rounded-[0.25rem] border bg-background", box, className)}>
			{src && (
				<AvatarImage
					src={src}
					alt=""
					loading="lazy"
					// Site icons are a third-party lookup; there's no reason to tell
					// them which page of the app the user is on.
					referrerPolicy="no-referrer"
					className="object-contain"
				/>
			)}
			<AvatarFallback className={cn("rounded-[inherit] bg-muted font-semibold text-muted-foreground uppercase", text)}>
				{logoInitials(name)}
			</AvatarFallback>
		</Avatar>
	);
}
