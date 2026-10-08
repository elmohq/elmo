import { COUNTRIES, countryName } from "@workspace/config/countries";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const COUNTRY_ITEMS = Object.fromEntries(COUNTRIES.map((country) => [country.code, country.name]));

export function CountrySelect({
	value,
	onChange,
	className,
}: {
	value: string;
	onChange: (country: string) => void;
	className?: string;
}) {
	return (
		<Select items={COUNTRY_ITEMS} value={value} onValueChange={(next) => next && onChange(next as string)}>
			<SelectTrigger className={className} aria-label="Country">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{COUNTRIES.map((country) => (
					<SelectItem key={country.code} value={country.code}>
						{country.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** Several countries at once, for adding the same prompts in each of them. */
export function CountriesPicker({ value, onChange }: { value: string[]; onChange: (countries: string[]) => void }) {
	const summary = value.length === 0 ? "No country" : value.map(countryName).join(", ");
	return (
		<Popover>
			<PopoverTrigger
				render={<Button type="button" variant="outline" size="sm" className="h-8 max-w-64 justify-start truncate" />}
			>
				<span className="truncate">{summary}</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<div className="max-h-64 overflow-y-auto py-1">
					{COUNTRIES.map((country) => {
						const checked = value.includes(country.code);
						return (
							<button
								type="button"
								key={country.code}
								onClick={() =>
									onChange(checked ? value.filter((code) => code !== country.code) : [...value, country.code])
								}
								className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-muted"
							>
								<Checkbox checked={checked} className="pointer-events-none" />
								<span className="flex-1">{country.name}</span>
								<span className="font-mono text-[10px] text-muted-foreground">{country.code}</span>
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
