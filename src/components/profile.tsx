"use client";
import { useUser } from "@auth0/nextjs-auth0";
import { SectionCards } from "./section-cards";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

export default function Profile() {
	const { user, isLoading } = useUser();

	if (isLoading) {
		return <p>Loading...</p>;
	}

	if (user) {
		return (
			<>
				<SectionCards />

				{WHITE_LABEL_CONFIG.name}
				<div style={{ textAlign: "center" }}>
					<img
						src={user.picture}
						alt="Profile"
						style={{ borderRadius: "50%", width: "80px", height: "80px" }}
					/>
					<h2>{user.name}</h2>
					<p>{user.email}</p>
					<pre>{JSON.stringify(user, null, 2)}</pre>
					<p>
						<a href="/auth/logout">Logout</a>
					</p>
				</div>
			</>
		);
	}
}
