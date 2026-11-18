import { createMiddleware } from "@tanstack/react-start";
import { isAuthenticationRequired, signInAgain } from "@/lib/auth/session-errors";

/**
 * A tab can outlive its session, and route loaders, query functions and event
 * handlers all call server functions, so this is the one place every call
 * passes through in the browser.
 */
export const sessionExpiredMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (isAuthenticationRequired(error)) signInAgain();
		throw error;
	}
});
