import { Badge } from "@workspace/ui/components/badge";
import { CornerDownRight } from "lucide-react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import type { PromptDetailTab } from "@/lib/prompt-detail-tabs";

export interface PromptVariant {
	id: string;
	value: string;
	enabled: boolean;
}

/** The other wordings of the question a prompt asks, each linking to its own results. */
export function PromptVariants({ variants, tab }: { variants: PromptVariant[]; tab?: PromptDetailTab }) {
	if (variants.length === 0) return null;
	return (
		<section aria-label="Variants" className="rounded-md border text-sm">
			<h2 className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
				Variants: other wordings of this question, each tracked on its own
			</h2>
			<ul className="divide-y">
				{variants.map((variant) => (
					<li key={variant.id} className="flex items-center gap-2 px-3 py-2">
						<CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
						<BrandPromptLink
							promptId={variant.id}
							search={tab ? { tab } : undefined}
							className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
						>
							{variant.value}
						</BrandPromptLink>
						{!variant.enabled && (
							<Badge variant="outline" className="text-xs font-normal text-muted-foreground">
								Disabled
							</Badge>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
