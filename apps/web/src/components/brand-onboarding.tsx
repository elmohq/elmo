import { useNavigate } from "@tanstack/react-router";
import { brandSegment } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { validateBrandDomain } from "@/lib/brand-domain";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createBrandFn } from "@/server/brands";
import type { OnboardingPlatformState } from "@/server/platform-picks";

interface BrandOnboardingProps {
	organizationSlug: string;
	brandId: string;
	brandName: string;
	platformState: OnboardingPlatformState;
}

export default function BrandOnboarding({ organizationSlug, brandId, brandName, platformState }: BrandOnboardingProps) {
	const [step, setStep] = useState<"domain" | "platforms">("domain");
	const [domain, setDomain] = useState("");
	const [selected, setSelected] = useState<Set<string>>(
		platformState ? new Set(platformState.defaultSelected) : new Set(),
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const writeError = useWriteErrorMessage();
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();

	const createBrand = async (enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			const { brand } = await createBrandFn({
				data: {
					brandId,
					brandName,
					domain,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
			});
			trackEvent("brand_created", { has_website: Boolean(domain) });

			await organizationsChanged(() =>
				navigate({
					to: "/app/org/$org/brand/$brand",
					params: { org: organizationSlug, brand: brandSegment(brand) },
				}),
			);
		} catch (err) {
			setError(writeError(err, "Could not create the brand."));
		} finally {
			setIsLoading(false);
		}
	};

	const handleDomainSubmit = async () => {
		setError("");

		const validation = validateBrandDomain(domain);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}

		if (platformState) {
			setStep("platforms");
			return;
		}
		await createBrand(null);
	};

	if (step === "platforms" && platformState) {
		return (
			<FullPageCard title={`Setup ${brandName}`} subtitle="Choose which AI platforms to track">
				<PlatformSelectionStep
					state={platformState}
					selected={selected}
					onSelectedChange={setSelected}
					disabled={isLoading}
					error={error}
					onBack={() => setStep("domain")}
					onSubmit={() => createBrand([...selected])}
					submitLabel={isLoading ? "Setting up..." : "Complete Setup"}
				/>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={`Setup ${brandName}`} subtitle="Configure your brand to get started" showBackButton={true}>
			<form action={handleDomainSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="domain">Domain</Label>
					<Input
						id="domain"
						name="domain"
						type="text"
						placeholder="example.com"
						required
						disabled={isLoading}
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">Your brand's primary domain</p>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Setting up..." : platformState ? "Continue" : "Complete Setup"}
				</Button>
			</form>
		</FullPageCard>
	);
}
