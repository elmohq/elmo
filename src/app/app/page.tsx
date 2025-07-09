import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getElmoOrgs } from "@/lib/metadata";

export default async function BrandSwitcherPage() {
	const orgs = await getElmoOrgs();

	return (
		<div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
			<Card className="mx-auto">
				<CardContent className="flex flex-col items-center space-y-6 py-4 px-12">
					<div className="flex items-center space-x-3 pb-4">
						<img src={WHITE_LABEL_CONFIG.icon} alt="Logo" className="!size-5" />
						<span className="text-base font-semibold">{WHITE_LABEL_CONFIG.name}</span>
					</div>

					<div className="flex flex-col space-y-3">
						{orgs.length > 0 ? (
							orgs.map((org: { id: string, name: string }) => (
								<Button key={org.id} asChild variant="outline" className="min-w-[200px]">
									<Link href={`/app/${org.id}`}>
										{org.name}
									</Link>
								</Button>
							))
						) : (
							<p className="text-muted-foreground text-center">No brands available</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
