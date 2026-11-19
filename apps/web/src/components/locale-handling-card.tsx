import { COUNTRIES, countryName } from "@workspace/config/markets";
import { labelForModelFilter } from "@workspace/config/model-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import type { MarketTarget } from "@/lib/market-support";

/** Past this many, a list of exceptions stops being readable in a table cell. */
const MAX_NAMED_EXCEPTIONS = 3;

function countryHandling(target: MarketTarget): string {
	if (target.locationFree) return "Not used: answers without web search";
	const missing = target.defaultLocationCountries;
	if (missing.length === 0) return "Sent";
	if (missing.length === COUNTRIES.length) return "Not sent: uses the provider's default";
	const exceptions =
		missing.length <= MAX_NAMED_EXCEPTIONS ? missing.map(countryName).join(", ") : `${missing.length} countries`;
	return `Sent, except ${exceptions}`;
}

/** What each tracked model is told about a prompt's country and language. */
export function LocaleHandlingCard({ targets }: { targets: MarketTarget[] }) {
	if (targets.length === 0) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Countries and Languages</CardTitle>
				<CardDescription>
					A prompt&apos;s country and language are passed on wherever a model&apos;s provider accepts them. Every model
					runs every prompt either way.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Model</TableHead>
							<TableHead>Country</TableHead>
							<TableHead>Language</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{targets.map((target) => (
							<TableRow key={target.value}>
								<TableCell className="font-medium">{labelForModelFilter(target.value)}</TableCell>
								<TableCell>{countryHandling(target)}</TableCell>
								<TableCell>{target.sendsLanguage ? "Sent" : "From the prompt's wording"}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
