import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useCallback, useMemo, useRef } from "react";

export const CAPTCHA_FAILED_MESSAGE = "Bot check failed. Please try again.";
const CAPTCHA_UNAVAILABLE_MESSAGE = "Bot check couldn't load. Check your blockers.";
const CAPTCHA_INTERACTIVE_MESSAGE = "Complete the bot check, then try again.";

const SOLVE_TIMEOUT_MS = 10_000;

const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export class CaptchaError extends Error {}

export function isCaptchaRejection(error: { code?: string } | null | undefined): boolean {
	return !!error?.code && CAPTCHA_ERROR_CODES.has(error.code);
}

export function useTurnstile() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const siteKey = context.clientConfig?.turnstileSiteKey;
	const ref = useRef<TurnstileInstance>(null);
	const state = useRef<{ token?: string; problem?: string }>({});
	const waiters = useRef(new Set<() => void>());

	const update = useCallback((next: { token?: string; problem?: string }) => {
		state.current = next;
		if (next.token || next.problem) for (const wake of [...waiters.current]) wake();
	}, []);

	const getCaptchaHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
		if (!siteKey) return undefined;
		if (!state.current.token && !state.current.problem) {
			await new Promise<void>((resolve) => {
				const wake = () => {
					clearTimeout(timer);
					waiters.current.delete(wake);
					resolve();
				};
				const timer = setTimeout(wake, SOLVE_TIMEOUT_MS);
				waiters.current.add(wake);
			});
		}
		const { token, problem } = state.current;
		if (!token) throw new CaptchaError(problem ?? CAPTCHA_UNAVAILABLE_MESSAGE);
		update({});
		// Tokens are single-use, so start solving the next one right away.
		ref.current?.reset();
		return { "x-captcha-response": token };
	}, [siteKey, update]);

	const scriptOptions = useMemo(() => ({ onError: () => update({ problem: CAPTCHA_UNAVAILABLE_MESSAGE }) }), [update]);

	const widget = siteKey ? (
		<Turnstile
			ref={ref}
			siteKey={siteKey}
			options={{ appearance: "interaction-only", theme: "light", size: "flexible" }}
			scriptOptions={scriptOptions}
			onSuccess={(token) => update({ token })}
			onExpire={() => update({})}
			onBeforeInteractive={() => update({ problem: CAPTCHA_INTERACTIVE_MESSAGE })}
			onError={() => update({ problem: CAPTCHA_FAILED_MESSAGE })}
			onUnsupported={() => update({ problem: CAPTCHA_UNAVAILABLE_MESSAGE })}
		/>
	) : null;

	return { widget, getCaptchaHeaders };
}
