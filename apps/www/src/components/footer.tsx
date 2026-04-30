import { Link } from "@tanstack/react-router";
import { Separator } from "@workspace/ui/components/separator";
import { Logo } from "./logo";

export function Footer() {
	return (
		<footer className="py-12">
			<div className="space-y-6 px-4 md:px-6">
				<div className="grid gap-8 md:grid-cols-4">
					<div className="space-y-4">
						<Link to="/" className="flex items-center space-x-2">
							<Logo />
						</Link>
						<p className="text-muted-foreground text-sm">
							Open source AI visibility platform. Track how AI search engines
							talk about your brand.
						</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-lg font-semibold">Product</h3>
						<ul className="[&_li_a]:text-muted-foreground [&_li_a]:hover:text-foreground space-y-2 [&_li_a]:block [&_li_a]:text-sm [&_li_a]:transition-colors [&_li_a]:hover:underline">
							<li>
								<Link to="/features">Features</Link>
							</li>
							<li>
								<Link to="/pricing">Pricing</Link>
							</li>
							<li>
								<Link to="/changelog">Changelog</Link>
							</li>
							<li>
								<Link to="/roadmap">Roadmap</Link>
							</li>
						</ul>
					</div>
					<div className="space-y-4">
						<h3 className="text-lg font-semibold">Resources</h3>
						<ul className="[&_li_a]:text-muted-foreground [&_li_a]:hover:text-foreground space-y-2 [&_li_a]:block [&_li_a]:text-sm [&_li_a]:transition-colors [&_li_a]:hover:underline">
							<li>
								<Link to="/docs">Documentation</Link>
							</li>
							<li>
								<a href="/docs/developer-guide/api-reference">API Reference</a>
							</li>
							<li>
								<Link to="/ai-visibility-tools">AI Visibility Tool Directory</Link>
							</li>
							<li>
								<Link to="/status">AI Provider Status</Link>
							</li>
							<li>
								<a
									href="https://github.com/elmohq/elmo/issues"
									target="_blank"
									rel="noopener noreferrer"
								>
									Issues
								</a>
							</li>
						</ul>
					</div>
					<div className="space-y-4">
						<h3 className="text-lg font-semibold">Company</h3>
						<ul className="[&_li_a]:text-muted-foreground [&_li_a]:hover:text-foreground space-y-2 [&_li_a]:block [&_li_a]:text-sm [&_li_a]:transition-colors [&_li_a]:hover:underline">
							<li>
								<Link to="/vision">Our Vision</Link>
							</li>
							<li>
								<Link to="/brand">Brand Assets</Link>
							</li>
						</ul>
					</div>
				</div>
			<Separator className="lg:mt-10" />
			<div className="text-muted-foreground flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
				<div className="text-xs">
					&copy; {new Date().getFullYear()}{" "}
					<a
						href="https://bluewhale.dev"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-foreground transition-colors hover:underline"
					>
						Blue Whale Software, LLC
					</a>
				</div>
				<div className="flex items-center gap-3">
					<a
						href="https://x.com/tryelmo"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-foreground transition-colors"
						aria-label="Twitter / X"
					>
						<svg viewBox="0 0 24 24" className="size-4 fill-current">
							<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
						</svg>
					</a>
					<a
						href="https://linkedin.com/company/elmohq"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-foreground transition-colors"
						aria-label="LinkedIn"
					>
						<svg viewBox="0 0 24 24" className="size-4 fill-current">
							<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
						</svg>
					</a>
					<a
						href="https://discord.gg/s24nubCtKz"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-foreground transition-colors"
						aria-label="Discord"
					>
						<svg viewBox="0 0 24 24" className="size-4 fill-current">
							<path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
						</svg>
					</a>
					<a
						href="https://github.com/elmohq/elmo"
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-foreground transition-colors"
						aria-label="GitHub"
					>
						<svg viewBox="0 0 24 24" className="size-4 fill-current">
							<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
						</svg>
					</a>
				</div>
			</div>
			</div>
		</footer>
	);
}
