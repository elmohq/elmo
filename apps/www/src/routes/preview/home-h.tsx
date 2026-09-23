import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantH } from "@/components/home-preview/h/home";

export const Route = createFileRoute("/preview/home-h")({
	head: () => ({
		meta: [{ title: "Homepage preview H · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantH,
});
