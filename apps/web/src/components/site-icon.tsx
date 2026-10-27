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
import { faviconUrl, isLightMark } from "@/lib/site-icon";

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

function readIsLightMark(image: HTMLImageElement): boolean {
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return false;
	context.drawImage(image, 0, 0);
	try {
		return isLightMark(context.getImageData(0, 0, canvas.width, canvas.height).data);
	} catch {
		return false;
	}
}

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
	const [needsBackdrop, setNeedsBackdrop] = useState(false);
	if (checkedSrc !== src) {
		setCheckedSrc(src);
		setNeedsBackdrop(false);
	}

	// Square-ish rather than circular: these are site icons, not people.
	return (
		<Avatar aria-hidden="true" className={cn("shrink-0 rounded-[0.25rem]", box, className)}>
			{src && (
				<AvatarImage
					src={src}
					alt=""
					loading="lazy"
					onLoad={(event) => setNeedsBackdrop(readIsLightMark(event.currentTarget))}
					className={cn("rounded-[inherit] object-contain", needsBackdrop && "bg-foreground")}
				/>
			)}
			{/* Waiting out a request in flight beats flashing the glyph on every
			    row of a table and then swapping it for an icon. Without a domain
			    there's nothing to wait for, so those fall back at once. */}
			<AvatarFallback delay={src ? 300 : 0} className="rounded-[inherit] bg-muted text-muted-foreground">
				<IconWorld className={GLYPH_SCALE} />
			</AvatarFallback>
		</Avatar>
	);
}
