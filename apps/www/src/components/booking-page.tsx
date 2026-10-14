import { trackAdConversion } from "@workspace/ui/lib/ad-tags";
import { useEffect, useRef } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { embedInlineBooking } from "@/lib/cal-embed";

interface BookingPageProps {
	eyebrow: string;
	heading: string;
	intro: string;
	calLink: string;
	/** Passed through to the booking, where Cal.com prefills matching questions with them. */
	params?: Record<string, string>;
}

// Every booked call counts as the ads' demo conversion, whichever event type it's for.
export function BookingPage({ eyebrow, heading, intro, calLink, params }: BookingPageProps) {
	const booker = useRef<HTMLDivElement>(null);
	const paramsKey = JSON.stringify(params ?? {});

	useEffect(() => {
		if (!booker.current) return;
		embedInlineBooking({
			element: booker.current,
			calLink,
			params: JSON.parse(paramsKey),
			onBooked: (uid) => trackAdConversion("demo_booked", { id: uid }),
		});
	}, [calLink, paramsKey]);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-10 space-y-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</p>
					<h1 className="font-heading text-4xl text-zinc-950 lg:text-5xl">{heading}</h1>
					<p className="max-w-2xl text-lg text-balance text-zinc-600">{intro}</p>
				</header>
				<div ref={booker} className="min-h-[640px] w-full overflow-auto" />
			</main>
			<Footer />
		</div>
	);
}
