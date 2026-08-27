/**
 * The logo for a brand, competitor, or cited domain.
 *
 * Decorative by design — every surface renders the name alongside it, so the
 * mark carries no information a screen reader would otherwise miss.
 */
import { IconWorld } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";
import { faviconUrl } from "@/lib/brand-logo";

export type BrandLogoSize = "xs" | "sm" | "md" | "lg";

// `request` is the pixel size asked of the favicon service — 2x the rendered
// box, so the icon stays sharp on retina displays.
const SIZES: Record<BrandLogoSize, { box: string; glyph: string; request: number }> = {
	xs: { box: "size-4", glyph: "size-2.5", request: 32 },
	sm: { box: "size-5", glyph: "size-3", request: 64 },
	md: { box: "size-6", glyph: "size-3.5", request: 64 },
	lg: { box: "size-8", glyph: "size-4", request: 64 },
};

export function BrandLogo({
	domain,
	size = "sm",
	className,
}: {
	/** Domain or website URL. Without one, the mark is the fallback glyph. */
	domain?: string | null;
	size?: BrandLogoSize;
	className?: string;
}) {
	const { box, glyph, request } = SIZES[size];
	const src = faviconUrl(domain, request);

	// Square-ish rather than circular: these are site icons, not people.
	return (
		<Avatar aria-hidden="true" className={cn("shrink-0 rounded-[0.25rem]", box, className)}>
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
			{/* Waiting out a request in flight beats flashing the glyph on every
			    row of a table and then swapping it for an icon. Nothing to wait
			    for without a `src`, so those fall back at once. */}
			<AvatarFallback delay={src ? 300 : 0} className="rounded-[inherit] bg-muted text-muted-foreground">
				<IconWorld className={glyph} />
			</AvatarFallback>
		</Avatar>
	);
}
