import { COUNTRIES } from "@workspace/config/markets";
import { labelForModelFilter } from "@workspace/config/model-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { CountryLabel } from "@/components/country-picker";
import type { MarketSupport, MarketTarget } from "@/lib/market-support";

function Mark({ yes, children }: { yes: boolean; children: ReactNode }) {
	const Icon = yes ? Check : Minus;
	return (
		<span className="flex items-center gap-1.5">
			<Icon className={yes ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"} aria-hidden />
			<span className={yes ? undefined : "text-muted-foreground"}>{children}</span>
		</span>
	);
}

function CountryCell({ target, country }: { target: MarketTarget; country: string }) {
	if (target.locationFree) return <Mark yes={false}>No location</Mark>;
	return target.defaultLocationCountries.includes(country) ? (
		<Mark yes={false}>Not supported</Mark>
	) : (
		<Mark yes>Supported</Mark>
	);
}

function coverage(target: MarketTarget): string {
	if (target.locationFree) return "None";
	const supported = COUNTRIES.length - target.defaultLocationCountries.length;
	return supported === COUNTRIES.length ? `All ${COUNTRIES.length}` : `${supported} of ${COUNTRIES.length}`;
}

/** Per tracked model: whether it can be asked from each country the brand uses, and how it learns the language. */
export function LocaleHandlingCard({ support }: { support: MarketSupport }) {
	if (support.targets.length === 0) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Countries and Languages</CardTitle>
				<CardDescription>
					Every model runs every prompt. This shows which models can be asked from the countries your prompts use.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Model</TableHead>
							{support.countriesInUse.map((country) => (
								<TableHead key={country}>
									<CountryLabel country={country} />
								</TableHead>
							))}
							<TableHead>All Countries</TableHead>
							<TableHead>Language</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{support.targets.map((target) => (
							<TableRow key={target.value}>
								<TableCell className="font-medium">{labelForModelFilter(target.value)}</TableCell>
								{support.countriesInUse.map((country) => (
									<TableCell key={country}>
										<CountryCell target={target} country={country} />
									</TableCell>
								))}
								<TableCell className="text-muted-foreground">{coverage(target)}</TableCell>
								<TableCell>
									<Mark yes={target.sendsLanguage}>{target.sendsLanguage ? "Set" : "Inferred"}</Mark>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<ul className="space-y-1 text-xs text-muted-foreground">
					<li>
						<strong className="font-medium text-foreground">Not supported:</strong> the model still answers, from its
						provider&apos;s usual location.
					</li>
					<li>
						<strong className="font-medium text-foreground">No location:</strong> the model answers without searching
						the web, so where it is asked from makes no difference.
					</li>
					<li>
						<strong className="font-medium text-foreground">Inferred:</strong> the model has no language setting and
						answers in the language the prompt is written in.
					</li>
				</ul>
			</CardContent>
		</Card>
	);
}
