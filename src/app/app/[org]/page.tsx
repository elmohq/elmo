import Profile from "@/components/profile";

export default function AppPage({ params }: { params: { org: string } }) {
	return (
		<div>
			{params.org} <Profile />
		</div>
	);
}
