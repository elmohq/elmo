import { requireBrandSession } from "@/lib/auth/helpers";

/** A response refusing the request, or null when the caller may read the brand. */
export async function authorizedBrand(brandId: string): Promise<Response | null> {
	try {
		await requireBrandSession(brandId);
		return null;
	} catch {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
}
