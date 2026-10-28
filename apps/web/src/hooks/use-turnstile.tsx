import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef } from "react";

const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export class TurnstileError extends Error {
	constructor() {
		super("Bot check failed. Please try again.");
		this.name = "TurnstileError";
	}
}

export function isCaptchaRejection(error: { code?: string } | null | undefined): boolean {
	return !!error?.code && CAPTCHA_ERROR_CODES.has(error.code);
}

export function useTurnstile(siteKey: string | undefined) {
	const ref = useRef<TurnstileInstance>(null);

	const getCaptchaHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
		if (!siteKey) return undefined;
		const widget = ref.current;
		if (!widget) throw new TurnstileError();
		try {
			return { "x-captcha-response": await widget.getResponsePromise() };
		} catch {
			throw new TurnstileError();
		} finally {
			// Tokens are single-use, so start solving the next one right away.
			widget.reset();
		}
	}, [siteKey]);

	const widget = siteKey ? (
		<Turnstile
			ref={ref}
			siteKey={siteKey}
			options={{ appearance: "interaction-only", theme: "light", size: "flexible" }}
		/>
	) : null;

	return { widget, getCaptchaHeaders };
}
