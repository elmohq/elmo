/**
 * The logo for a brand, competitor, or cited domain.
 *
 * Decorative by design — every surface renders the name alongside it, so the
 * mark carries no information a screen reader would otherwise miss.
 */
import { IconWorld } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { faviconUrl } from "@/lib/brand-logo";

export type BrandLogoSize = "xs" | "sm" | "md" | "lg";

// `request` is the pixel size asked of the favicon service — 2x the rendered
// box, so the icon stays sharp on retina displays.
const SIZES: Record<BrandLogoSize, { box: string; request: number }> = {
	xs: { box: "size-4", request: 32 },
	sm: { box: "size-5", request: 64 },
	md: { box: "size-6", request: 64 },
	lg: { box: "size-8", request: 64 },
};

/** Share of the box the fallback glyph fills, so it reads at every size. */
const GLYPH_SCALE = "size-[75%]";

// The service answers a domain it has no icon for with a 404 whose body is a
// generic globe — and a 404 body renders like any other image, so it never
// reaches the error path. That placeholder is always 16px square, while every
// `request` above asks for more, so an image that comes back this small is the
// one signal we get that the icon is missing.
const PLACEHOLDER_SIZE = 16;

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
	const { box, request } = SIZES[size];
	const src = faviconUrl(domain, request);

	const [checkedSrc, setCheckedSrc] = useState<string | null>(null);
	const [isPlaceholder, setIsPlaceholder] = useState(false);
	if (checkedSrc !== src) {
		setCheckedSrc(src);
		setIsPlaceholder(false);
	}

	const iconSrc = isPlaceholder ? null : src;

	// Square-ish rather than circular: these are site icons, not people.
	return (
		<Avatar aria-hidden="true" className={cn("shrink-0 rounded-[0.25rem]", box, className)}>
			{iconSrc && (
				<AvatarImage
					src={iconSrc}
					alt=""
					loading="lazy"
					// Site icons are a third-party lookup; there's no reason to tell
					// them which page of the app the user is on.
					referrerPolicy="no-referrer"
					onLoad={(event) => {
						if (event.currentTarget.naturalWidth <= PLACEHOLDER_SIZE) setIsPlaceholder(true);
					}}
					className="object-contain"
				/>
			)}
			{/* Waiting out a request in flight beats flashing the glyph on every
			    row of a table and then swapping it for an icon. Nothing to wait
			    for once the icon is ruled out, so those fall back at once. */}
			<AvatarFallback delay={iconSrc ? 300 : 0} className="rounded-[inherit] bg-muted text-muted-foreground">
				<IconWorld className={GLYPH_SCALE} />
			</AvatarFallback>
		</Avatar>
	);
}
