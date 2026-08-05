import {
	type CreateOrganizationApiBrandInput,
	OrganizationResourceConflictError,
	OrganizationResourceNotFoundError,
	type UpdateOrganizationApiBrandInput,
} from "@workspace/lib/cloud/api-resources";
import { CapacityExceededError, EntitlementAccessError } from "@workspace/lib/cloud/capacity";
import { InvalidPromptMutationError } from "@workspace/lib/cloud/prompt-mutations";
import { TrackingSettingsError } from "@workspace/lib/cloud/tracking-settings";
import { sanitizeUserTags } from "@workspace/lib/tag-utils";
import type { CreateBrandInput, UpdateBrandInput } from "@/server/onboarding-core";
import { dedupeAliases, dedupeDomains } from "../domain-categories";
import { ApiError } from "./handler";

export function mapOrganizationResourceError(error: unknown): ApiError | undefined {
	if (error instanceof OrganizationResourceNotFoundError) {
		return new ApiError(404, "Not Found", error.message);
	}
	if (error instanceof EntitlementAccessError) {
		return new ApiError(403, "Forbidden", error.message);
	}
	if (
		error instanceof CapacityExceededError ||
		error instanceof OrganizationResourceConflictError ||
		error instanceof InvalidPromptMutationError ||
		error instanceof TrackingSettingsError
	) {
		return new ApiError(409, "Conflict", error.message);
	}
}

export function toOrganizationApiBrandCreate(
	organizationId: string,
	input: CreateBrandInput,
): CreateOrganizationApiBrandInput {
	const websiteHost = new URL(input.website).hostname.replace(/^www\./, "");
	const seenCompetitorDomains = new Set<string>();
	const competitors = (input.competitors ?? []).flatMap((competitor) => {
		const domains = dedupeDomains(competitor.domains ?? []).filter(
			(domain) => domain !== websiteHost && !seenCompetitorDomains.has(domain),
		);
		if (domains.length === 0) return [];
		for (const domain of domains) seenCompetitorDomains.add(domain);
		return [
			{
				name: competitor.name.trim(),
				domains,
				aliases: dedupeAliases(competitor.aliases ?? []),
			},
		];
	});

	return {
		organizationId,
		id: input.id,
		name: input.name,
		website: input.website,
		additionalDomains: dedupeDomains(input.additionalDomains ?? []).filter((domain) => domain !== websiteHost),
		aliases: dedupeAliases(input.aliases ?? []),
		competitors,
		prompts: (input.prompts ?? []).map((prompt) => ({
			value: prompt.value,
			enabled: prompt.enabled ?? true,
			tags: sanitizeUserTags(prompt.tags ?? []),
		})),
	};
}

export function toOrganizationApiBrandUpdate(
	organizationId: string,
	input: UpdateBrandInput,
): UpdateOrganizationApiBrandInput {
	const websiteHost = input.website ? new URL(input.website).hostname.replace(/^www\./, "") : undefined;
	return {
		organizationId,
		brandId: input.brandId,
		name: input.brandName,
		website: input.website,
		additionalDomains:
			input.additionalDomains === undefined
				? undefined
				: dedupeDomains(input.additionalDomains).filter((domain) => domain !== websiteHost),
		aliases: input.aliases === undefined ? undefined : dedupeAliases(input.aliases),
		enabled: input.enabled,
	};
}
