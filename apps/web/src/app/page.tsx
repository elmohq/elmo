"use client";

import { Button } from "@workspace/ui/components/button";
import { redirect } from "next/navigation";
import FullPageCard from "@/components/full-page-card";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
	const { user, isLoading, loginUrl } = useAuth();

	if (isLoading) {
		return <p>Loading...</p>;
	}

	if (!user) {
		// If no login URL (shouldn't happen with local auth), redirect to app anyway
		if (!loginUrl) {
			redirect("/app");
		}
		return (
			<FullPageCard className="">
				<Button asChild>
					<a href={loginUrl}>Sign In</a>
				</Button>
			</FullPageCard>
		);
	} else {
		// redirect to /app
		redirect("/app");
	}
}
