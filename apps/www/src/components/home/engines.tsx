import { ModelIcon } from "@workspace/ui/brand/model-icon";

/** Gemini shares Google's iconId in the catalog, but beside AI Overviews it needs its own mark to be told apart. */
function GeminiMark({ className }: { className: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-current ${className}`}>
			<path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
		</svg>
	);
}

export function EngineIcon({ iconId, className = "size-4" }: { iconId: string; className?: string }) {
	if (iconId === "gemini") return <GeminiMark className={className} />;
	return <ModelIcon iconId={iconId} className={className} />;
}
