import Profile from "@/components/profile";

export default async function AppPage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<div>
			{org} <Profile />
		</div>
	);
}
