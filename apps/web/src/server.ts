import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry(
	wrapFetchWithSentry({
		fetch(request: Request) {
			return handler.fetch(request);
		},
	}),
);
