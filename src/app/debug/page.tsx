import { auth0 } from "@/lib/auth0";
import { getElmoOrgs } from "@/lib/metadata";

import { ManagementClient } from "auth0";
import BrandsDebug from "./brands-debug";

const management = new ManagementClient({
	domain: process.env.AUTH0_MGMT_API_DOMAIN!,
	clientId: process.env.AUTH0_CLIENT_ID!,
	clientSecret: process.env.AUTH0_CLIENT_SECRET!,
});

export default async function MetadataPage() {
	const session = await auth0.getSession();
	const userData = await management.users.get({ id: session?.user?.sub!, fields: "app_metadata" });

	return (
		<div>
			<h2>User App Metadata</h2>
			<pre>{JSON.stringify(userData, null, 2)}</pre>

			<h2>Session</h2>
			<pre>{JSON.stringify(session, null, 2)}</pre>

			<h2>Redis Cached Elmo Orgs</h2>
			<pre>{JSON.stringify(await getElmoOrgs(), null, 2)}</pre>

			<h2>DB Brands</h2>
			<BrandsDebug />
		</div>
	);
}
