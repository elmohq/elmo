import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";

interface FullPageCardProps {
	logoHref?: string;
	title?: string;
	subtitle?: string;
	children?: ReactNode;
	showBackButton?: boolean;
	backButtonHref?: string;
	backButtonText?: string;
	customBackButton?: ReactNode;
	className?: string;
}

export default function FullPageCard({
	logoHref,
	title,
	subtitle,
	children = undefined,
	showBackButton = false,
	backButtonHref = "/app",
	backButtonText = "Go Back",
	customBackButton,
	className = "w-md",
}: FullPageCardProps) {
	const { isAuthenticated } = useAuth();
	const markHref = logoHref ?? (isAuthenticated ? "/app" : null);

	return (
		<div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
			<div className={`mx-auto ${className}`}>
				<div className="flex items-center justify-center space-x-3">
					{markHref ? (
						<Link to={markHref} aria-label="Go to your organizations">
							<Logo />
						</Link>
					) : (
						<Logo />
					)}
				</div>
				<Card className="my-8">
					{(title || subtitle) && (
						<CardHeader className={subtitle ? "text-center" : "text-center grid-rows-1 gap-0"}>
							{title && <CardTitle className="text-xl">{title}</CardTitle>}
							{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
						</CardHeader>
					)}
					{children && (
						<>
							{(title || subtitle) && <Separator />}
							<CardContent className={title || subtitle ? "" : "flex flex-col items-center space-y-6 py-4 px-12"}>
								{children}
							</CardContent>
						</>
					)}
				</Card>
				{customBackButton ? (
					<div className="flex justify-center">{customBackButton}</div>
				) : showBackButton ? (
					<div className="flex justify-center">
						<Link to={backButtonHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
							{backButtonText}
						</Link>
					</div>
				) : null}
			</div>
		</div>
	);
}
