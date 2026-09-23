import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantA } from "@/components/home-preview/a/home";

export const Route = createFileRoute("/preview/home-a")({
	head: () => ({
		meta: [{ title: "Homepage preview A · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantA,
});
