import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getElmoOrgs } from "@/lib/metadata";
import FullPageCard from "@/components/full-page-card";

export default async function BrandSwitcherPage() {
	const orgs = await getElmoOrgs();

	return (
		<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
			<div className="flex flex-col space-y-3">
				{orgs.length > 0 ? (
					orgs.map((org: { id: string, name: string }) => (
						<Button key={org.id} asChild variant="secondary" className="min-w-[200px]">
							<Link href={`/app/${org.id}`}>
								{org.name}
							</Link>
						</Button>
					))
				) : (
					<p className="text-muted-foreground text-center">No brands available</p>
				)}
			</div>
		</FullPageCard>
	);
}
