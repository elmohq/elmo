import { useNavigate } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Layers } from "lucide-react";
import { FilterTriggerButton } from "@/components/filter-bar";
import { useBrandParams } from "@/hooks/use-route-params";
import type { PromptDetailTab } from "@/lib/prompt-detail-tabs";

export interface PromptVariant {
	id: string;
	value: string;
	enabled: boolean;
}

/** Switches between the wordings of one question, each a prompt with results of its own. Absent for a prompt with no variants. */
export function PromptVariantsMenu({
	promptId,
	variants,
	tab,
}: {
	promptId: string;
	/** Every prompt in the group, the one being viewed included. */
	variants: PromptVariant[];
	tab?: PromptDetailTab;
}) {
	const params = useBrandParams();
	const navigate = useNavigate();
	if (variants.length <= 1) return null;

	const open = (id: string) =>
		navigate({
			to: "/app/org/$org/brand/$brand/prompts/$promptId",
			params: { ...params, promptId: id },
			search: { tab },
		});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<FilterTriggerButton icon={<Layers className="size-3.5" />} label="Variants" badgeCount={variants.length} />
				}
			/>
			<DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
				<DropdownMenuRadioGroup value={promptId} onValueChange={open}>
					<DropdownMenuGroup>
						<DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
							Wordings of This Question
						</DropdownMenuLabel>
						{variants.map((variant) => (
							<DropdownMenuRadioItem key={variant.id} value={variant.id} className="cursor-pointer gap-2">
								<span className="min-w-0 flex-1 truncate">{variant.value}</span>
								{!variant.enabled && <span className="shrink-0 text-xs text-muted-foreground">Disabled</span>}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
