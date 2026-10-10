import { type Market, marketCode, marketName } from "@workspace/config/markets";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { MarketList, MarketPopover } from "@/components/market-picker";

export interface MarketMember extends Market {
	_key: string;
	/** Saved members have one; their market is fixed. */
	id?: string;
	enabled: boolean;
}

const chip = "h-6 rounded-full px-2.5 font-mono text-[11px]";

/**
 * The markets one prompt is tracked in. Picking a chip shows that market's
 * wording and settings in the row; a new, unsaved market can still be changed
 * or dropped.
 */
export function PromptMarketChips({
	members,
	activeKey,
	onSelect,
	onAdd,
	onChangeMarket,
	onRemove,
}: {
	members: MarketMember[];
	activeKey: string;
	onSelect: (key: string) => void;
	onAdd: (market: Market) => void;
	onChangeMarket: (key: string, market: Market) => void;
	onRemove: (key: string) => void;
}) {
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState(false);

	return (
		<div className="flex flex-wrap items-center gap-1">
			{members.map((member) => {
				const active = member._key === activeKey;
				const className = cn(
					chip,
					active
						? "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
						: "text-muted-foreground",
					!member.enabled && "line-through opacity-60",
				);
				const title = `${marketName(member)}${member.enabled ? "" : " (off)"}`;
				if (active && !member.id) {
					return (
						<MarketPopover
							key={member._key}
							open={editing}
							onOpenChange={setEditing}
							trigger={
								<Button type="button" variant="outline" size="sm" className={cn(className, "gap-1")} title={title} />
							}
							label={
								<>
									{marketCode(member)}
									<ChevronDown className="size-3" />
								</>
							}
						>
							<MarketList
								exclude={members.filter((other) => other._key !== member._key)}
								onPick={(market) => {
									onChangeMarket(member._key, market);
									setEditing(false);
								}}
							/>
							{members.length > 1 && (
								<button
									type="button"
									onClick={() => onRemove(member._key)}
									className="w-full border-t px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
								>
									Remove this market
								</button>
							)}
						</MarketPopover>
					);
				}
				return (
					<Button
						key={member._key}
						type="button"
						variant="outline"
						size="sm"
						className={className}
						title={title}
						onClick={() => onSelect(member._key)}
					>
						{marketCode(member)}
					</Button>
				);
			})}
			<MarketPopover
				open={adding}
				onOpenChange={setAdding}
				trigger={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={cn(chip, "gap-0.5 font-sans text-muted-foreground")}
					/>
				}
				label={
					<>
						<Plus className="size-3" /> Market
					</>
				}
			>
				<MarketList
					exclude={members}
					onPick={(market) => {
						onAdd(market);
						setAdding(false);
					}}
				/>
			</MarketPopover>
		</div>
	);
}
