import { Check, Mail, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EngineIcon } from "./engines";
import { CARD, ExampleTag } from "./ui";

const BRAND = "Loftwell";
const SOURCE = "deskreviewlab.com";

/*
 * The story in beats: the answer leaves you out → Elmo finds the page it's
 * built from → you pitch that page → the page adds you → the answer drops a
 * competitor and names you first. Each beat is one state; CSS transitions do
 * the in-betweens.
 */
const BEATS = [2200, 1700, 1900, 1700, 1000, 3800] as const;
const FINAL = BEATS.length - 1;

type Row = { name: string; note: string };

const COMPETITORS: Row[] = [
	{ name: "Uplane", note: "quiet and stable" },
	{ name: "Deskhaven", note: "best value" },
	{ name: "Riserly", note: "budget pick" },
];
const YOU: Row = { name: BRAND, note: "compact, top-rated" };

const ROW_H = 44;

function useBeat() {
	const [beat, setBeat] = useState(0);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setBeat(FINAL);
			return;
		}
		let visible = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let current = 0;
		const tick = () => {
			timer = setTimeout(() => {
				if (visible) {
					current = current === FINAL ? 0 : current + 1;
					setBeat(current);
				}
				tick();
			}, BEATS[current]);
		};
		tick();
		// Off-screen loops are wasted work and would restart mid-story on return.
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
		});
		if (ref.current) observer.observe(ref.current);
		return () => {
			clearTimeout(timer);
			observer.disconnect();
		};
	}, []);

	return { beat, ref };
}

function StatusPill({ won }: { won: boolean }) {
	return (
		<span
			className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium ring-1 transition-colors duration-500 ${
				won ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-50 text-zinc-500 ring-zinc-200"
			}`}
		>
			<span
				className={`size-1.5 rounded-full transition-colors duration-500 ${won ? "bg-emerald-500" : "bg-zinc-300"}`}
			/>
			{won ? `${BRAND} is #1` : `${BRAND} not mentioned`}
		</span>
	);
}

function Cite({ active }: { active?: boolean }) {
	return (
		<sup
			className={`ml-1 inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold not-italic transition-colors duration-500 ${
				active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-500"
			}`}
		>
			1
		</sup>
	);
}

const ERASED = COMPETITORS[2];

function RowShell({ rank, visible, children }: { rank: number; visible: boolean; children: React.ReactNode }) {
	return (
		<li
			className="absolute inset-x-0 flex items-center transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.3,0.7,0.2,1)]"
			style={{ height: ROW_H, transform: `translateY(${rank * ROW_H}px)`, opacity: visible ? 1 : 0 }}
		>
			<span className="w-6 shrink-0 text-sm text-zinc-400 tabular-nums">{rank + 1}.</span>
			{children}
		</li>
	);
}

function YouRow({ won }: { won: boolean }) {
	return (
		<RowShell rank={0} visible={won}>
			<span className="inline-flex min-w-0 items-baseline">
				<span
					className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[16px] font-semibold text-blue-700 ring-1 ring-blue-200"
					style={{
						clipPath: won ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
						transition: "clip-path 700ms cubic-bezier(0.3,0.7,0.2,1) 250ms",
					}}
				>
					{YOU.name}
				</span>
				<span
					className="ml-1 truncate text-[15px] text-zinc-500"
					style={{ opacity: won ? 1 : 0, transition: "opacity 500ms ease 700ms" }}
				>
					— {YOU.note}
				</span>
				<Cite active={won} />
			</span>
		</RowShell>
	);
}

function CompetitorRow({
	row,
	rank,
	citeActive,
	erasing,
	won,
}: {
	row: Row;
	rank: number;
	citeActive: boolean;
	erasing: boolean;
	won: boolean;
}) {
	const isErased = row === ERASED;
	const dropped = rank === -1;
	return (
		<RowShell rank={dropped ? 2 : rank} visible={!dropped}>
			<span className="inline-flex min-w-0 items-baseline">
				<span className="px-1.5 py-0.5 text-[16px] font-semibold text-zinc-950">{row.name}</span>
				<span className="ml-1 truncate text-[15px] text-zinc-500">— {row.note}</span>
				{isErased ? null : <Cite active={citeActive} />}
			</span>
			{isErased ? (
				// The eraser: a paper-coloured bar wipes the line out left to right.
				<span
					aria-hidden="true"
					className="absolute inset-y-1 -left-1 -right-1 origin-left rounded bg-white transition-transform duration-700 ease-in-out"
					style={{ transform: `scaleX(${erasing || won ? 1 : 0})` }}
				>
					<span
						className="absolute inset-y-1 right-0 w-0.5 rounded-full bg-blue-600 transition-opacity duration-300"
						style={{ opacity: erasing && !won ? 1 : 0 }}
					/>
				</span>
			) : null}
		</RowShell>
	);
}

function AnswerCard({ beat }: { beat: number }) {
	const erasing = beat >= 4;
	const won = beat >= FINAL;
	const citeActive = beat >= 1 && beat <= 3;
	const order = won ? [YOU, ...COMPETITORS.slice(0, 2)] : COMPETITORS;

	return (
		<div className={`relative p-6 md:p-7 ${CARD}`}>
			<div className="flex items-center justify-between gap-3">
				<span className="inline-flex items-center gap-2 text-[15px] font-semibold text-zinc-950">
					<EngineIcon iconId="openai" className="size-[18px]" />
					ChatGPT
				</span>
				<StatusPill won={won} />
			</div>

			<p className="ml-auto mt-6 w-fit max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-[15px] text-zinc-900">
				What's the best standing desk for a home office?
			</p>

			<p className="mt-5 text-[15px] text-zinc-600">Reviewers keep recommending:</p>
			<ol className="relative mt-2" style={{ height: ROW_H * 3 }}>
				<YouRow won={won} />
				{COMPETITORS.map((row) => (
					<CompetitorRow
						key={row.name}
						row={row}
						rank={order.indexOf(row)}
						citeActive={citeActive}
						erasing={erasing && row === ERASED}
						won={won}
					/>
				))}
			</ol>

			<div className="mt-5 flex items-center gap-2 border-t border-zinc-100 pt-4 text-[13px] text-zinc-500">
				Sources
				<span
					className={`inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 font-medium transition-all duration-500 ${
						citeActive
							? "bg-blue-50 text-blue-700 ring-2 ring-blue-500"
							: "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200"
					}`}
				>
					<span className="inline-flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200">
						1
					</span>
					{SOURCE}
				</span>
			</div>
		</div>
	);
}

function SourceCard({ beat }: { beat: number }) {
	const found = beat >= 1;
	const drafting = beat >= 2;
	const sent = beat >= 3;
	const updated = beat >= 3;

	return (
		<div
			className={`relative overflow-hidden transition-[box-shadow] duration-500 ${CARD} ${found ? "ring-2 ring-blue-500/70" : ""}`}
		>
			<div className="flex h-10 items-center gap-2 border-b border-zinc-100 bg-zinc-50/70 px-4">
				<span aria-hidden="true" className="flex gap-1">
					<span className="size-2 rounded-full bg-zinc-200" />
					<span className="size-2 rounded-full bg-zinc-200" />
					<span className="size-2 rounded-full bg-zinc-200" />
				</span>
				<span className="ml-2 truncate font-mono text-xs text-zinc-500">{SOURCE}/best-standing-desks</span>
			</div>
			<div className="px-6 pb-28 pt-5 md:px-7">
				<p className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-950">The best standing desks of 2026</p>
				<div aria-hidden="true" className="mt-3 space-y-1.5">
					<div className="h-1.5 w-full rounded-full bg-zinc-100" />
					<div className="h-1.5 w-4/5 rounded-full bg-zinc-100" />
				</div>
				<ul className="mt-4 text-[15px] text-zinc-700">
					<li
						className="grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(0.3,0.7,0.2,1)]"
						style={{ gridTemplateRows: updated ? "1fr" : "0fr", opacity: updated ? 1 : 0 }}
					>
						<span className="overflow-hidden">
							<span className="flex items-center gap-2 py-1">
								<span className="font-semibold text-blue-700">{BRAND} Air</span>
								<span className="rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
									Added
								</span>
							</span>
						</span>
					</li>
					{["Uplane Pro", "Deskhaven Flex", "Riserly One"].map((d) => (
						<li key={d} className="py-1">
							{d}
						</li>
					))}
				</ul>
			</div>

			<div
				className="absolute inset-x-4 bottom-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_12px_32px_-12px_rgb(24_24_27/0.25)] transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.3,0.7,0.2,1)] md:inset-x-5"
				style={{
					transform: drafting ? (sent ? "translateY(6px) scale(0.98)" : "none") : "translateY(24px)",
					opacity: drafting ? (sent ? 0.55 : 1) : 0,
				}}
			>
				<div className="flex items-center gap-3">
					<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
						<Mail className="size-4" aria-hidden="true" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[13px] text-zinc-500">To: editor@{SOURCE}</p>
						<p className="truncate text-[14px] font-medium text-zinc-950">{BRAND} for your standing-desk roundup?</p>
					</div>
					<span
						className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors duration-300 ${
							sent ? "bg-emerald-50 text-emerald-700" : "bg-blue-600 text-white"
						}`}
					>
						{sent ? (
							<Check className="size-3.5" aria-hidden="true" />
						) : (
							<Send className="size-3.5" aria-hidden="true" />
						)}
						{sent ? "Sent" : "Send"}
					</span>
				</div>
			</div>
		</div>
	);
}

const STEPS = [
	{ label: "Find the source AI trusts", from: 1, to: 1 },
	{ label: "Get your brand into it", from: 2, to: 3 },
	{ label: "Top the answer", from: 4, to: FINAL },
];

function Steps({ beat }: { beat: number }) {
	return (
		<ol className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
			{STEPS.map((s, i) => {
				const active = beat >= s.from && beat <= s.to;
				const done = beat > s.to;
				return (
					<li key={s.label} className="flex items-center gap-2.5 sm:flex-col sm:gap-2 sm:text-center">
						<span
							className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition-colors duration-500 ${
								active ? "bg-blue-600 text-white" : done ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"
							}`}
						>
							{i + 1}
						</span>
						<span
							className={`text-[15px] font-medium transition-colors duration-500 ${active ? "text-zinc-950" : "text-zinc-500"}`}
						>
							{s.label}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function Bridge({ beat }: { beat: number }) {
	const out = beat >= 1 && beat <= 3;
	const back = beat >= 4;
	return (
		<div aria-hidden="true" className="flex items-center justify-center max-md:h-8 max-md:rotate-90 md:w-16">
			<svg aria-hidden="true" viewBox="0 0 64 40" className="w-16 overflow-visible">
				<path
					d="M4 12 H56"
					fill="none"
					stroke={out ? "#2563eb" : "rgb(228 228 231)"}
					strokeWidth="2"
					strokeDasharray="52"
					strokeDashoffset={out ? 0 : 52}
					style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms" }}
				/>
				<path d="M52 8 L57 12 L52 16" fill="none" stroke={out ? "#2563eb" : "rgb(228 228 231)"} strokeWidth="2" />
				<path
					d="M60 28 H8"
					fill="none"
					stroke={back ? "#10b981" : "rgb(228 228 231)"}
					strokeWidth="2"
					strokeDasharray="52"
					strokeDashoffset={back ? 0 : 52}
					style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms" }}
				/>
				<path d="M12 24 L7 28 L12 32" fill="none" stroke={back ? "#10b981" : "rgb(228 228 231)"} strokeWidth="2" />
			</svg>
		</div>
	);
}

export function AnswerStory() {
	const { beat, ref } = useBeat();
	return (
		<div ref={ref} className="mx-auto max-w-5xl">
			<p className="sr-only">
				Illustration: ChatGPT answers a buyer's question without naming {BRAND}. Elmo finds that the answer cites{" "}
				{SOURCE}, you email the site's editor, the page adds {BRAND}, and ChatGPT's answer then names {BRAND} first.
			</p>
			<div className="mb-4 flex justify-center">
				<ExampleTag>{BRAND} is a fictional brand</ExampleTag>
			</div>
			<div aria-hidden="true" className="flex flex-col items-stretch md:flex-row md:items-center">
				<div className="min-w-0 md:flex-[1.1]">
					<AnswerCard beat={beat} />
				</div>
				<Bridge beat={beat} />
				<div className="min-w-0 md:flex-1">
					<SourceCard beat={beat} />
				</div>
			</div>
			<Steps beat={beat} />
		</div>
	);
}
