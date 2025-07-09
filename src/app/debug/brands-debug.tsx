"use client";

import { useBrands } from "@/hooks/use-brands";

export default function BrandsDebug() {
	const brands = useBrands();

	return <pre>{JSON.stringify(brands, null, 2)}</pre>;
}
