import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { DashboardGraphic } from "./feature-graphics";

export function Hero() {
	return (
		<section className="py-10 lg:py-16">
			<div className="mx-auto max-w-7xl px-4 md:px-6">
				<div className="grid items-center gap-8 lg:grid-cols-2">
					<header className="flex flex-col items-center text-center lg:items-start lg:text-left">
						<Badge variant="outline">
							🚀 Open Source AEO Platform
							<ArrowUpRight />
						</Badge>
						<h1 className="font-heading my-4 text-4xl text-balance md:text-5xl lg:leading-14">
							Know How AI Talks About Your Brand
						</h1>
						<p className="text-muted-foreground mb-8 text-balance lg:text-lg">
							Track your brand's visibility across ChatGPT, Claude, and Google
							AI Overviews. Monitor mentions, analyze citations, and benchmark
							competitors — all self-hosted and open source.
						</p>
						<div className="flex justify-center gap-2">
							<Button asChild>
								<Link to="/docs">Get Started</Link>
							</Button>
							<Button asChild variant="outline">
								<a
									href="https://github.com/elmohq/elmo"
									target="_blank"
									rel="noopener noreferrer"
								>
									View on GitHub
								</a>
							</Button>
						</div>
					</header>
				<div className="w-full">
					<DashboardGraphic />
				</div>
				</div>
			</div>
		</section>
	);
}
