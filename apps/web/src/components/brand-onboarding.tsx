import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

import { useNavigate, useRouter } from "@tanstack/react-router";
import FullPageCard from "@/components/full-page-card";
import { createBrandFn } from "@/server/brands";
import { trackEvent } from "@/lib/posthog";
import * as m from "@/paraglide/messages.js";

interface BrandOnboardingProps {
	brandId: string;
	brandName: string;
}

export default function BrandOnboarding({ brandId, brandName }: BrandOnboardingProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();
	const router = useRouter();

	const handleSubmit = async (formData: FormData) => {
		setIsLoading(true);
		setError("");

		try {
			const website = formData.get("website") as string;
			await createBrandFn({
				data: { brandId, brandName, website },
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await router.invalidate();
			await navigate({ to: "/app/$brand", params: { brand: brandId } });
		} catch (err) {
			setError(m.common_error());
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<FullPageCard title={m.brand_setup_title({ brandName })} subtitle={m.brand_setup_description()} showBackButton={true}>
			<form action={handleSubmit} className="space-y-4">
				<input type="hidden" name="brandId" value={brandId} />
				<input type="hidden" name="brandName" value={brandName} />

				<div className="space-y-2">
					<Label htmlFor="website">{m.brand_website()}</Label>
					<Input id="website" name="website" type="text" placeholder="example.com" required disabled={isLoading} />
					<p className="text-xs text-muted-foreground">{m.brand_website_help()}</p>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? m.brand_setting_up() : m.brand_complete_setup()}
				</Button>
			</form>
		</FullPageCard>
	);
}
