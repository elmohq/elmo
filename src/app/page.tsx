"use client";

import { Button } from "@/components/ui/button";
import { useUser } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";
import FullPageCard from "@/components/full-page-card";

export default function Home() {
	const { user, isLoading } = useUser();

	if (isLoading) {
		return <p>Loading...</p>;
	}

	if (!user) {
		return (
			<FullPageCard className="">
				<Button asChild>
					<a href="/auth/login">Sign In</a>
				</Button>
			</FullPageCard>
		);
	} else {
		// redirect to /app
		redirect("/app");
	}
}
