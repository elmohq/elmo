import { CircleCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { WaitlistForm } from "./waitlist-form";
import { ContactForm } from "./contact-form";

interface Plan {
	id: string;
	name: string;
	description: string;
	price: string;
	features: string[];
	button?: {
		text: string;
		url: string;
	};
	waitlist?: boolean;
	contact?: boolean;
}

const plans: Plan[] = [
	{
		id: "free",
		name: "Free",
		description: "Self-host on your own infrastructure with full access",
		price: "$0",
		features: [
			"Unlimited brands & prompts",
			"All AI models supported",
			"Citation analysis",
			"Competitor tracking",
			"Full source code access",
			"Community support",
		],
		button: {
			text: "Get Started",
			url: "/docs",
		},
	},
	{
		id: "cloud",
		name: "Cloud",
		description: "Managed hosting so you can focus on insights",
		price: "Coming Soon",
		features: [
			"Everything in Free",
			"Managed hosting",
			"Automatic updates",
			"Priority support",
			"Uptime SLA",
			"No server management",
		],
		waitlist: true,
	},
	{
		id: "white-label",
		name: "White Label",
		description: "Deploy under your own brand with multi-org support",
		price: "Custom",
		features: [
			"Everything in Cloud",
			"Custom branding",
			"Multi-organization",
			"SSO via Auth0",
			"Dedicated support",
			"Custom integrations",
		],
		contact: true,
	},
];

export function Pricing() {
	return (
		<section id="pricing" className="py-12 lg:py-20">
			<div className="container mx-auto px-4 md:px-6">
				<div className="mx-auto flex max-w-5xl flex-col items-center space-y-6 text-center lg:space-y-8">
					<header className="mb-10 space-y-4">
						<h2 className="font-heading text-4xl text-balance lg:text-5xl">
							Free to Start, Scales With You
						</h2>
						<p className="text-muted-foreground text-balance lg:text-lg">
							Elmo is open source and free to self-host. Need managed hosting
							or white-label? We've got you covered.
						</p>
					</header>

					<div className="flex flex-col items-stretch gap-6 md:flex-row">
						{plans.map((plan) => (
							<Card
								key={plan.id}
								className="flex w-80 flex-col justify-between text-left shadow-none"
							>
								<CardHeader>
									<CardTitle>
										<p>{plan.name}</p>
									</CardTitle>
									<p className="text-muted-foreground text-sm">
										{plan.description}
									</p>
									<div className="flex items-end">
										<span className="text-3xl font-bold lg:text-4xl">
											{plan.price}
										</span>
									</div>
								</CardHeader>
								<CardContent>
									<Separator className="mb-6" />
									<ul className="space-y-4">
										{plan.features.map((feature, index) => (
											<li
												key={index}
												className="flex items-center gap-2 text-sm"
											>
												<CircleCheck className="size-4" />
												<span>{feature}</span>
											</li>
										))}
									</ul>
								</CardContent>
								<CardFooter className="mt-auto">
									{plan.contact ? (
										<ContactForm source="pricing" />
									) : plan.waitlist ? (
										<WaitlistForm source="pricing" />
									) : plan.button ? (
										<Button asChild className="w-full">
											{plan.button.url.startsWith("/") ? (
												<Link to={plan.button.url}>
													{plan.button.text}
												</Link>
											) : (
												<a
													href={plan.button.url}
													{...(plan.button.url.startsWith("http")
														? {
																target: "_blank",
																rel: "noopener noreferrer",
															}
														: {})}
												>
													{plan.button.text}
												</a>
											)}
										</Button>
									) : null}
								</CardFooter>
							</Card>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
