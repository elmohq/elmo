import { Link, useLoaderData } from "@tanstack/react-router";
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ArrowRight, Star } from "lucide-react";
import { Logo } from "@/components/logo";
import { formatStarCount } from "@/lib/github-stars";
import { GitHubIcon } from "./icons";
import { FOCUS_RING } from "./ui";

const navigationLinks = [
	{ href: "/ai-visibility-tools/category/open-source", label: "Open Source Tools" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/changelog", label: "Changelog" },
	{ href: "/roadmap", label: "Roadmap" },
	{ href: "/vision", label: "Vision" },
	{ href: "/docs", label: "Docs" },
];

function MenuIcon() {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none"
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path
				d="M4 12L20 12"
				className="origin-center -translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-x-0 group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[315deg]"
			/>
			<path
				d="M4 12H20"
				className="origin-center transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.8)] group-aria-expanded:rotate-45"
			/>
			<path
				d="M4 12H20"
				className="origin-center translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[135deg]"
			/>
		</svg>
	);
}

export function Navbar() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;

	return (
		<header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/75 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/60">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
				<div className="flex items-center gap-3 md:gap-8">
					<Popover>
						<PopoverTrigger
							className={`group inline-flex size-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white md:hidden ${FOCUS_RING}`}
							aria-label="Open menu"
						>
							<MenuIcon />
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="w-52 border border-white/10 bg-zinc-900 p-1 text-zinc-200 shadow-2xl shadow-black/50 ring-0"
						>
							<nav aria-label="Main">
								<ul>
									{navigationLinks.map((link) => (
										<li key={link.href}>
											<a
												href={link.href}
												className="block rounded px-2.5 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
											>
												{link.label}
											</a>
										</li>
									))}
								</ul>
							</nav>
						</PopoverContent>
					</Popover>
					<Link to="/" aria-label="Homepage" className={`flex items-center rounded ${FOCUS_RING}`}>
						<Logo className="text-2xl text-blue-500" />
					</Link>
					<nav aria-label="Main" className="max-md:hidden">
						<ul className="flex items-center gap-0.5">
							{navigationLinks.map((link) => (
								<li key={link.href}>
									<a
										href={link.href}
										className={`rounded-md px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white ${FOCUS_RING}`}
									>
										{link.label}
									</a>
								</li>
							))}
						</ul>
					</nav>
				</div>
				<div className="flex items-center gap-2">
					<a
						href="https://github.com/elmohq/elmo"
						target="_blank"
						rel="noopener noreferrer"
						className={`group/star hidden h-8 items-center gap-2 rounded-md bg-white/[0.03] px-2.5 text-sm leading-none text-zinc-300 ring-1 ring-white/10 transition-colors hover:bg-white/[0.07] hover:text-white sm:inline-flex ${FOCUS_RING}`}
						aria-label={`Star elmo on GitHub${stars ? ` (${stars} stars)` : ""}`}
					>
						<GitHubIcon className="size-4" />
						{stars > 0 && (
							<span className="flex items-center gap-1 border-l border-white/10 pl-2 font-mono text-xs tabular-nums">
								<Star
									className="size-3 fill-transparent text-zinc-500 transition-colors group-hover/star:fill-amber-400 group-hover/star:text-amber-400"
									aria-hidden="true"
								/>
								{formatStarCount(stars)}
							</span>
						)}
					</a>
					<a
						href={CLOUD_SIGNUP_URL}
						className={`inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium leading-none text-zinc-950 transition-colors hover:bg-zinc-200 ${FOCUS_RING}`}
					>
						Sign up
						<ArrowRight className="size-3.5" aria-hidden="true" />
					</a>
				</div>
			</div>
		</header>
	);
}
