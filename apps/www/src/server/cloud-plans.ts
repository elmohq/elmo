import { createServerFn } from "@tanstack/react-start";
import { PUBLIC_CLOUD_CATALOG } from "@/lib/cloud-plans";

export const getPublicCloudCatalog = createServerFn({ method: "GET" }).handler(() => PUBLIC_CLOUD_CATALOG);
