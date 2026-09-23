import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantG } from "@/components/home-preview/g/home";

export const Route = createFileRoute("/preview/home-g")({
	head: () => ({
		meta: [{ title: "Homepage preview G · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantG,
});
