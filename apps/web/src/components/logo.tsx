import type { ComponentPropsWithoutRef } from "react";
import { clientConfig } from "@/lib/config/client";
import { cn } from "@workspace/ui/lib/utils";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
}

export function Logo({
	className,
	iconClassName,
	textClassName,
	...props
}: LogoProps) {
	const { branding, mode } = clientConfig;
	const isWhitelabel = mode === "whitelabel";

	if (!isWhitelabel) {
		return (
			<div {...props} className={cn("flex items-center gap-2", className)}>
				<span
					className={cn(
						"text-base font-semibold lowercase tracking-tight text-blue-600",
						textClassName,
					)}
				>
					{branding.name}
				</span>
			</div>
		);
	}

	return (
		<div {...props} className={cn("flex items-center gap-2", className)}>
			<img
				src={branding.icon}
				alt={`${branding.name} logo`}
				className={cn("size-5", iconClassName)}
			/>
			<span className={cn("text-base font-semibold", textClassName)}>{branding.name}</span>
		</div>
	);
}
