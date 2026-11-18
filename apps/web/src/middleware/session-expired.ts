import { createSerializationAdapter } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { AuthenticationRequiredError, signInAgain } from "@/lib/auth/session-errors";

/** Without this the error reaches the browser as a plain Error and loses its class. */
export const authenticationRequiredAdapter = createSerializationAdapter({
	key: "AuthenticationRequiredError",
	test: (value): value is AuthenticationRequiredError => value instanceof AuthenticationRequiredError,
	toSerializable: () => null,
	fromSerializable: () => new AuthenticationRequiredError(),
});

/**
 * A tab can outlive its session, and route loaders, query functions and event
 * handlers all call server functions, so this is the one place every call
 * passes through in the browser.
 */
export const sessionExpiredMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		// Client middleware also runs on the server while it renders a page.
		if (error instanceof AuthenticationRequiredError && typeof window !== "undefined") signInAgain();
		throw error;
	}
});
