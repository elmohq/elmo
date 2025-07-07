"use client"

import { useAuth0 } from "@auth0/auth0-react"
import { getAccessToken } from '@auth0/nextjs-auth0';
import Profile from "./Profile"

export default function SwitchOrg() {
	const { getAccessTokenSilently } = useAuth0()

    return <div><div onClick={async () => {
        console.log("starting")
        const token = await getAccessToken();
        await getAccessTokenSilently({
            authorizationParams: {
                audience: `https://login.whitelabel-client.com/api/v2/`,
                scope: 'read:current_user'
            }
        })
        console.log("token", token);
    }}>SwitchOrg</div>
    <div className="p-4 bg-gray-100"><Profile /></div>
    </div>;
}
