import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useCallback, useRef } from "react";

export const CAPTCHA_FAILED_MESSAGE = "Bot check failed. Please try again.";

const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export function isCaptchaRejection(error: { code?: string } | null | undefined): boolean {
	return !!error?.code && CAPTCHA_ERROR_CODES.has(error.code);
}

export function useTurnstile() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const siteKey = context.clientConfig?.turnstileSiteKey;
	const ref = useRef<TurnstileInstance>(null);

	const getCaptchaHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
		const widget = ref.current;
		if (!widget) return undefined;
		try {
			return { "x-captcha-response": await widget.getResponsePromise() };
		} catch {
			return undefined;
		} finally {
			// Tokens are single-use, so start solving the next one right away.
			widget.reset();
		}
	}, []);

	const widget = siteKey ? (
		<Turnstile
			ref={ref}
			siteKey={siteKey}
			options={{ appearance: "interaction-only", theme: "light", size: "flexible" }}
		/>
	) : null;

	return { widget, getCaptchaHeaders };
}
