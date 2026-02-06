import { redirect } from "next/navigation";

export default async function SettingsPage({ params }: { params: Promise<{ brand: string }> }) {
	const { brand } = await params;
	redirect(`/app/${brand}/settings/brand`);
}
