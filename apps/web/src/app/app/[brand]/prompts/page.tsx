import { redirect } from "next/navigation";

export default async function PromptsPage({ params }: { params: Promise<{ brand: string }> }) {
	const { brand } = await params;
	redirect(`/app/${brand}/visibility`);
}
