import { useNavigate, useRouter } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/lib/providers/models";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformPicker, usePlatformToggle } from "@/components/platform-picker";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { trackEvent } from "@/lib/posthog";
import { createBrandFn, type OnboardingPlatformState } from "@/server/brands";

interface BrandOnboardingProps {
	brandId: string;
	brandName: string;
	platformState: OnboardingPlatformState | null;
}

export default function BrandOnboarding({
	brandId,
	brandName,
	platformState,
}: BrandOnboardingProps) {
	const [step, setStep] = useState<"website" | "platforms">("website");
	const [website, setWebsite] = useState("");
	const [selected, setSelected] = useState<Set<string>>(
		platformState ? new Set(platformState.defaultSelected) : new Set(),
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();
	const router = useRouter();

	const createBrand = async (enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			await createBrandFn({
				data: {
					brandId,
					brandName,
					website,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await router.invalidate();
			await navigate({ to: "/app/$brand", params: { brand: brandId } });
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleWebsiteSubmit = async () => {
		setError("");

		const validation = validateWebsiteUrl(website);
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

	const toggle = usePlatformToggle(selected, setSelected);

	if (step === "platforms" && platformState) {
		const limit = platformState.platformPicks;
		const locked = platformState.available.length === 1;
		const onlyOption = platformState.available[0];

		return (
			<FullPageCard title={`Setup ${brandName}`} subtitle="Choose which AI platforms to track">
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						{locked && onlyOption
							? `Your plan includes ${getModelMeta(onlyOption.model).label} tracking. You can change platforms anytime in settings.`
							: `Your plan tracks up to ${limit} platform${limit === 1 ? "" : "s"} for this brand. You can change these anytime in settings.`}
					</p>

					<PlatformPicker
						options={platformState.available}
						selected={selected}
						onToggle={toggle}
						limit={limit}
						disabled={isLoading || locked}
						className="sm:grid-cols-1 lg:grid-cols-1"
					/>

					{!locked && (
						<p className="text-xs text-muted-foreground">
							{selected.size === 0 ? "Pick at least one platform." : `${selected.size} of ${limit} selected`}
						</p>
					)}

					{error && <p className="text-sm text-destructive">{error}</p>}

					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={() => setStep("website")} disabled={isLoading}>
							Back
						</Button>
						<Button
							type="button"
							className="flex-1"
							onClick={() => createBrand([...selected])}
							disabled={isLoading || selected.size === 0}
						>
							{isLoading ? "Setting up..." : "Complete Setup"}
						</Button>
					</div>
				</div>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={`Setup ${brandName}`} subtitle="Configure your brand to get started" showBackButton={true}>
			<form action={handleWebsiteSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="website">Website</Label>
					<Input
						id="website"
						name="website"
						type="text"
						placeholder="example.com"
						required
						disabled={isLoading}
						value={website}
						onChange={(e) => setWebsite(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">Enter your brand's website</p>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Setting up..." : platformState ? "Continue" : "Complete Setup"}
				</Button>
			</form>
		</FullPageCard>
	);
}
