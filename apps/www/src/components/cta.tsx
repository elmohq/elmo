import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";

export function CTA() {
	return (
		<section className="py-12 lg:py-20">
			<div className="mx-auto max-w-7xl px-4 md:px-6">
				<div className="bg-muted/50 flex w-full flex-col gap-6 rounded-lg p-8 md:rounded-xl lg:flex-row lg:items-center lg:p-10">
					<div className="flex-1">
						<h3 className="font-heading mb-4 text-3xl text-balance md:text-4xl">
							Ready to Monitor Your AI Visibility?
						</h3>
						<p className="text-muted-foreground text-balance lg:text-lg">
							Deploy Elmo in minutes with Docker. No credit card required, no
							vendor lock-in — just open source AI visibility monitoring.
						</p>
					</div>
					<div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:gap-4">
						<Button variant="outline" asChild>
							<a
								href="https://github.com/elmohq/elmo"
								target="_blank"
								rel="noopener noreferrer"
							>
								View Source Code
							</a>
						</Button>
						<Button asChild variant="default" size="lg">
							<Link to="/docs">Read the Docs</Link>
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
