import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantJ } from "@/components/home-preview/j/home";

export const Route = createFileRoute("/preview/home-j")({
	head: () => ({
		meta: [{ title: "Homepage preview J · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantJ,
});
