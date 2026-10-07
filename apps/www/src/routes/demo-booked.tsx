import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { trackAdConversion } from "@workspace/ui/lib/ad-tags";
import { useEffect } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

const title = "Demo booked · Elmo";
const description = "Your Elmo demo is booked. Check your inbox for the calendar invite.";

// Cal.com redirects here after a booking and forwards the booking's details as
// query parameters, including the attendee's name and email.
export const Route = createFileRoute("/demo-booked")({
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, { name: "robots", content: "noindex, follow" }],
	}),
	component: DemoBookedPage,
});

function DemoBookedPage() {
	const navigate = useNavigate();

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.size === 0) return;
		// Off the URL before either ad tag reads it for the page view: the
		// attendee's details must not reach Google or Meta that way.
		void navigate({ to: "/demo-booked", search: {}, replace: true });
		// A refresh or a direct visit has no booking, so only Cal.com's redirect counts.
		const uid = params.get("uid");
		if (uid) trackAdConversion("demo_booked", { id: uid, email: params.get("email") ?? undefined });
	}, [navigate]);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-2xl px-4 py-24 text-center md:px-6 lg:py-32">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ DEMO BOOKED</p>
				<h1 className="mt-4 font-heading text-4xl text-zinc-950 lg:text-5xl">You're booked</h1>
				<p className="mt-4 text-lg text-balance text-zinc-600">
					A calendar invite is on its way to your inbox. Looking forward to showing you Elmo.
				</p>
				<div className="mt-8 flex justify-center gap-3">
					<a href="/docs" className={buttonVariants({ variant: "outline" })}>
						Read the docs
					</a>
					<a href="/" className={buttonVariants({ variant: "default" })}>
						Back to home
					</a>
				</div>
			</main>
			<Footer />
		</div>
	);
}
