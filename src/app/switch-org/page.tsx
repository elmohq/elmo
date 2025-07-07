"use client"

import { Auth0Provider } from "@auth0/auth0-react"
import SwitchOrg from "./SwitchOrg"

export default function SwitchOrgPage() {
	return (
        <Auth0Provider domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!} clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}>
            <SwitchOrg />
        </Auth0Provider>
	)
}
