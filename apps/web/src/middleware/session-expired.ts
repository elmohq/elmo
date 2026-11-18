import { createSerializationAdapter } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { AuthenticationRequiredError, signInAgain } from "@/lib/auth/session-errors";

export const authenticationRequiredAdapter = createSerializationAdapter({
	key: "AuthenticationRequiredError",
	test: (value): value is AuthenticationRequiredError => value instanceof AuthenticationRequiredError,
	toSerializable: () => null,
	fromSerializable: () => new AuthenticationRequiredError(),
});

export const sessionExpiredMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		// Client middleware also runs on the server while it renders a page.
		if (error instanceof AuthenticationRequiredError && typeof window !== "undefined") signInAgain();
		throw error;
	}
});
