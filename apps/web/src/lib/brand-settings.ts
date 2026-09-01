import { validateWebsiteUrl } from "@/lib/brand-website";
import { cleanAndValidateDomain, inDomainSet } from "@/lib/domain-categories";

/**
 * Pure normalization/validation for the "edit brand settings" flow, extracted
 * from the updateBrand server function so the rules can be unit-tested without a
 * database or auth session (issue #107). The server function applies auth and
 * persistence; this owns the field-level rules:
 *
 *  - name: trimmed; must be non-empty when provided
 *  - website: validated + normalized to a full URL (path preserved)
 *  - additionalDomains: each cleaned/validated (hard error listing the invalid
 *    ones), then de-duplicated, then stripped of entries a broader tracked
 *    domain already covers (issue #571)
 *  - aliases: trimmed, empties dropped, de-duplicated
 *
 * Only keys present on the input are touched, so a partial edit leaves the rest
 * of the brand untouched.
 */
export interface BrandUpdateInput {
	name?: string;
	website?: string;
	additionalDomains?: string[];
	aliases?: string[];
}

interface BrandUpdateFields {
	name?: string;
	website?: string;
	additionalDomains?: string[];
	aliases?: string[];
}

export type NormalizeBrandUpdateResult = { ok: true; updates: BrandUpdateFields } | { ok: false; error: string };

export function normalizeBrandUpdate(input: BrandUpdateInput): NormalizeBrandUpdateResult {
	const updates: BrandUpdateFields = {};

	if (input.name !== undefined) {
		if (!input.name.trim()) {
			return { ok: false, error: "Brand name must be a non-empty string" };
		}
		updates.name = input.name.trim();
	}

	if (input.website !== undefined) {
		const urlValidation = validateWebsiteUrl(input.website);
		if (!urlValidation.isValid) {
			return { ok: false, error: urlValidation.error };
		}
		updates.website = urlValidation.formattedUrl;
	}

	if (input.additionalDomains !== undefined) {
		const cleaned = input.additionalDomains.map((d) => cleanAndValidateDomain(d));
		const invalid = input.additionalDomains.filter((_, i) => !cleaned[i]);
		if (invalid.length > 0) {
			return { ok: false, error: `Invalid domain(s): ${invalid.join(", ")}` };
		}
		const unique = [...new Set(cleaned.filter(Boolean) as string[])];
		// Brand matching is suffix-based (`inDomainSet`, which categorizeDomain
		// uses), so `acme.io` already covers `blog.acme.io` and storing both
		// leaves an entry in the settings list that does nothing. Comparing each
		// domain against the others plus the website drops the narrower one,
		// in either entry order and through a chain of nested subdomains.
		//
		// The website is only consulted when it is part of this update: a partial
		// edit that sends domains alone has no website to compare against, and
		// this function deliberately never reads the stored brand.
		const websiteDomain = updates.website ? cleanAndValidateDomain(updates.website) : null;
		updates.additionalDomains = unique.filter((domain) => {
			const covering = new Set(unique.filter((other) => other !== domain));
			if (websiteDomain) covering.add(websiteDomain);
			return !inDomainSet(domain, covering);
		});
	}

	if (input.aliases !== undefined) {
		updates.aliases = [...new Set(input.aliases.map((a) => a.trim()).filter(Boolean))];
	}

	return { ok: true, updates };
}
