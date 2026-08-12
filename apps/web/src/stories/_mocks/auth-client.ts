/**
 * Mock for @workspace/lib/auth/client used in Storybook stories.
 *
 * Checkout, plan changes and the Stripe Customer Portal all go through
 * better-auth's client plugin, which would redirect the browser. Stories stub
 * those calls so the buttons exercise their real loading and error states
 * without leaving the frame.
 */

type SubscriptionResult = { error: { message?: string } | null };

let _delayMs = 0;
let _error: string | null = null;
const _calls: { method: string; args: unknown }[] = [];

/** Hold the call open so a story can show the in-flight spinner. */
export function setMockSubscriptionDelay(ms: number) {
	_delayMs = ms;
}

/** Make the next subscription call fail, so stories can show the error alert. */
export function setMockSubscriptionError(message: string | null) {
	_error = message;
}

export function getMockSubscriptionCalls() {
	return _calls;
}

export function resetMockAuthClient() {
	_delayMs = 0;
	_error = null;
	_calls.length = 0;
}

async function respond(method: string, args: unknown): Promise<SubscriptionResult> {
	_calls.push({ method, args });
	if (_delayMs > 0) await new Promise((resolve) => setTimeout(resolve, _delayMs));
	return { error: _error ? { message: _error } : null };
}

export const authClient = {
	subscription: {
		upgrade: (args: unknown) => respond("upgrade", args),
		billingPortal: (args: unknown) => respond("billingPortal", args),
		cancel: (args: unknown) => respond("cancel", args),
		restore: (args: unknown) => respond("restore", args),
		list: async () => ({ data: [], error: null }),
	},
	signIn: { email: async () => ({ error: null }), social: async () => ({ error: null }) },
	signUp: { email: async () => ({ error: null }) },
	signOut: async () => ({ error: null }),
	useSession: () => ({ data: null, isPending: false }),
	organization: {
		inviteMember: async () => ({ error: null }),
		cancelInvitation: async () => ({ error: null }),
	},
};
