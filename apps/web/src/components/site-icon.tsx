/**
 * The icon for a brand, competitor, or cited domain.
 *
 * Decorative by design — every surface renders the name alongside it, so the
 * mark carries no information a screen reader would otherwise miss.
 */
import { IconWorld } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { faviconUrl } from "@/lib/site-icon";

export type SiteIconSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<SiteIconSize, string> = {
	xs: "size-4",
	sm: "size-5",
	md: "size-6",
	lg: "size-8",
};

/**
 * One request size for every box: the service can answer two sizes with two
 * different icons, so a brand asked for at 32 in one place and 64 in another
 * shows up as two marks for the same thing. One URL per domain also caches
 * across every surface. 64 is 2x the largest box, so nothing is upscaled.
 */
const REQUESTED_SIZE = 64;

/** Share of the box the fallback glyph fills, so it reads at every size. */
const GLYPH_SCALE = "size-[75%]";

// The service answers a domain it has no icon for with a 404 whose body is a
// generic globe — and a 404 body renders like any other image, so it never
// reaches the error path. That placeholder is always 16px square, well under
// what we ask for, so an image that comes back this small is the one signal we
// get that the icon is missing.
const PLACEHOLDER_SIZE = 16;

export function SiteIcon({
	domain,
	size = "sm",
	className,
}: {
	/** Domain or website URL. Without one, the mark is the fallback glyph. */
	domain?: string | null;
	size?: SiteIconSize;
	className?: string;
}) {
	const box = SIZES[size];
	const src = faviconUrl(domain, REQUESTED_SIZE);

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
