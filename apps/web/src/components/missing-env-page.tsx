import type { DeploymentMode } from "@workspace/config/types";
import type { MissingEnvVar } from "@workspace/config/env";
import FullPageCard from "@/components/full-page-card";
import * as m from "@/paraglide/messages.js";

interface MissingEnvPageProps {
	mode: DeploymentMode;
	missing: MissingEnvVar[];
}

export default function MissingEnvPage({ mode, missing }: MissingEnvPageProps) {
	const sortedMissing = [...missing].sort((a, b) => a.label.localeCompare(b.label));

	const localHint =
		mode === "local" ? m.env_local_hint() : m.env_deployment_hint();

	return (
		<FullPageCard title={m.env_missing_title()} subtitle={m.env_deployment_mode({ mode })} className="max-w-2xl">
			<div className="space-y-4 text-sm">
				<p>{localHint}</p>
				<ul className="space-y-3 rounded-md border bg-background p-4">
					{sortedMissing.map((item) => (
						<li key={item.id} className="flex flex-col gap-1">
							<span className="font-mono text-xs text-foreground">{item.label}</span>
							{item.description ? <span className="text-muted-foreground">{item.description}</span> : null}
						</li>
					))}
				</ul>
			</div>
		</FullPageCard>
	);
}
