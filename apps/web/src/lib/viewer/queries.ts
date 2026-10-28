import { getViewerFn } from "@/server/viewer";

export const viewerQuery = {
	queryKey: ["viewer"] as const,
	queryFn: () => getViewerFn(),
	staleTime: 30_000,
};
