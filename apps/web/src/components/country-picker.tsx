import { COUNTRIES, countryName, LANGUAGES } from "@workspace/config/markets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { CountryFlag } from "@/components/country-flag";
import { type MarketSupport, promptCost } from "@/lib/market-support";

export function CountryLabel({ country, className }: { country: string; className?: string }) {
	return (
		<span className={cn("flex min-w-0 items-center gap-2", className)}>
			<CountryFlag country={country} />
			<span className="truncate">{countryName(country)}</span>
		</span>
	);
}

export function CountrySelect({
	value,
	onChange,
	defaultCountry,
	id,
	disabled,
	className,
}: {
	/** Null follows the brand's country. */
	value: string | null;
	onChange: (country: string | null) => void;
	/** The brand's country, which a prompt with none of its own shows and which choosing goes back to following. */
	defaultCountry?: string;
	id?: string;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Select
			value={value ?? defaultCountry}
			onValueChange={(next) => onChange(next === defaultCountry ? null : (next as string))}
			disabled={disabled}
		>
			<SelectTrigger id={id} size="sm" aria-label={id ? undefined : "Country"} className={cn("w-full", className)}>
				<SelectValue>{(selected: string) => <CountryLabel country={selected} />}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{COUNTRIES.map((country) => (
					<SelectItem key={country.code} value={country.code}>
						<CountryLabel country={country.code} />
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function LanguageSelect({
	value,
	onChange,
	disabled,
	className,
}: {
	value: string;
	onChange: (language: string) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Select
			items={Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name]))}
			value={value}
			onValueChange={(next) => onChange(next as string)}
			disabled={disabled}
		>
			<SelectTrigger size="sm" aria-label="Language" className={cn("w-full", className)}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{LANGUAGES.map((language) => (
					<SelectItem key={language.code} value={language.code}>
						{language.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** To the cent below a hundred dollars, where a prompt's monthly cost usually sits. */
function formatMonthlyUsd(amount: number): string {
	return amount < 100 ? `$${amount.toFixed(2)}` : `$${Math.round(amount).toLocaleString()}`;
}

/** "6 provider calls a day, roughly $1.80 a month" */
function describeCost(callsPerDay: number, monthlyUsd: number | null): string {
	const calls = Number.isInteger(callsPerDay) ? callsPerDay : Number(callsPerDay.toFixed(1));
	const perDay = `${plural(calls, "provider call")} a day`;
	return monthlyUsd === null ? perDay : `${perDay}, roughly ${formatMonthlyUsd(monthlyUsd)} a month`;
}

/** What tracking one prompt costs. */
export function describePromptCost(support: MarketSupport): string {
	if (support.promptAllowance) {
		const { used, max } = support.promptAllowance;
		return `Each prompt uses 1 of your plan's ${max} prompts (${used} in use).`;
	}
	const cost = promptCost(support);
	return `Each prompt runs on ${plural(support.targets.length, "model")}: ${describeCost(cost.callsPerDay, cost.monthlyUsd)}${
		cost.monthlyUsd === null ? "" : " at estimated provider prices"
	}.`;
}
