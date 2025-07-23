import { NavUserNoSidebar } from "@/components/nav-user-no-sidebar";
import FullPageCard from "@/components/full-page-card";

export default function ReportsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<FullPageCard
			title="Reports"
			subtitle="Generate one-time brand reports."
			customBackButton={<NavUserNoSidebar />}
		>
			{children}
		</FullPageCard>
	);
} 