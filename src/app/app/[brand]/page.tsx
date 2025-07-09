import Profile from "@/components/profile";

export default async function AppPage({ params }: { params: Promise<{ org: string }> }) {
	return (
		<div>
			<Profile />
		</div>
	);
}
