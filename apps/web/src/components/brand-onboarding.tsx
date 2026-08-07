import { useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

import { useNavigate, useRouter } from "@tanstack/react-router";
import FullPageCard from "@/components/full-page-card";
import { PlatformPicker } from "@/components/platform-picker";
import { createBrandFn, getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/brands";
import { getModelMeta } from "@workspace/lib/providers/models";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { trackEvent } from "@/lib/posthog";

interface BrandOnboardingProps {
	brandId: string;
	brandName: string;
}

export default function BrandOnboarding({ brandId, brandName }: BrandOnboardingProps) {
	const [step, setStep] = useState<"website" | "platforms">("website");
	const [website, setWebsite] = useState("");
	// undefined = still resolving; null = no platform step (non-cloud or unlimited).
	const [platformState, setPlatformState] = useState<OnboardingPlatformState | undefined>(undefined);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;
		// In this flow the brand id doubles as the organization id (see createBrandFn).
		getOnboardingPlatformStateFn({ data: { organizationId: brandId } })
			.then((state) => {
				if (cancelled) return;
				setPlatformState(state);
				if (state) setSelected(new Set(state.defaultSelected));
			})
			.catch(() => {
				// Skip the step rather than block onboarding; creation falls back
				// to the plan-default picks server-side.
				if (!cancelled) setPlatformState(null);
			});
		return () => {
			cancelled = true;
		};
	}, [brandId]);

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

	const toggle = (model: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) next.add(model);
		else next.delete(model);
		setSelected(next);
	};

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

				<Button type="submit" className="w-full" disabled={isLoading || platformState === undefined}>
					{isLoading ? "Setting up..." : platformState ? "Continue" : "Complete Setup"}
				</Button>
			</form>
		</FullPageCard>
	);
}
