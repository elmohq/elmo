import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantK } from "@/components/home-preview/k/home";

export const Route = createFileRoute("/preview/home-k")({
	head: () => ({
		meta: [{ title: "Homepage preview K · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantK,
});
