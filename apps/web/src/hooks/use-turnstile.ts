import { useCallback, useEffect, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The header better-auth's captcha plugin reads the token from. */
const CAPTCHA_HEADER = "x-captcha-response";

/** Error codes the server's captcha plugin answers with. */
const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

interface TurnstileRenderOptions {
	sitekey: string;
	appearance: "always" | "execute" | "interaction-only";
	execution: "render" | "execute";
	retry: "auto" | "never";
	callback: (token: string) => void;
	"error-callback": () => boolean;
	"timeout-callback": () => void;
	"unsupported-callback": () => void;
}

interface TurnstileApi {
	render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
	execute: (widgetId: string) => void;
	reset: (widgetId: string) => void;
	remove: (widgetId: string) => void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export class TurnstileError extends Error {
	constructor() {
		super("We couldn't confirm you're not a bot. Please try again.");
		this.name = "TurnstileError";
	}
}

let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
	scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = SCRIPT_SRC;
		script.async = true;
		script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new TurnstileError()));
		script.onerror = () => {
			// Forget the failed load so the next attempt can fetch it again.
			scriptPromise = undefined;
			script.remove();
			reject(new TurnstileError());
		};
		document.head.appendChild(script);
	});
	return scriptPromise;
}

/** Whether a better-auth error came from the server rejecting the Turnstile token. */
export function isCaptchaRejection(error: { code?: string } | null | undefined): boolean {
	return !!error?.code && CAPTCHA_ERROR_CODES.has(error.code);
}

/**
 * Cloudflare Turnstile for the email auth forms. Without a site key it does
 * nothing, so forms can use it unconditionally.
 *
 * The challenge runs on submit rather than on page load, and a fresh token is
 * minted for every attempt: tokens are single-use, so a retry after a failed
 * sign-in would otherwise be rejected. Most visitors never see the widget; it
 * only appears in `ref`'s element when Cloudflare wants an interaction.
 */
export function useTurnstile(siteKey: string | undefined) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const widget = useRef<{ api: TurnstileApi; id: string; used: boolean } | null>(null);
	const ready = useRef<Promise<void> | null>(null);
	const pending = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);

	useEffect(() => {
		if (!siteKey || !container) return;
		let cancelled = false;

		const settle = (token?: string) => {
			const current = pending.current;
			pending.current = null;
			if (token) current?.resolve(token);
			else current?.reject(new TurnstileError());
		};

		ready.current = loadTurnstile().then((api) => {
			if (cancelled) return;
			const id = api.render(container, {
				sitekey: siteKey,
				appearance: "interaction-only",
				execution: "execute",
				// A failed attempt is surfaced to the visitor and retried on their next submit.
				retry: "never",
				callback: (token) => settle(token),
				"error-callback": () => {
					settle();
					return true;
				},
				"timeout-callback": () => settle(),
				"unsupported-callback": () => settle(),
			});
			if (id) widget.current = { api, id, used: false };
		});
		// Rendering waits for a submit, so a load failure surfaces there instead.
		ready.current.catch(() => {});

		return () => {
			cancelled = true;
			if (widget.current) widget.current.api.remove(widget.current.id);
			widget.current = null;
			ready.current = null;
		};
	}, [siteKey, container]);

	/** Headers to send with the auth request, solving a fresh challenge first. Throws TurnstileError on failure. */
	const getCaptchaHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
		if (!siteKey) return undefined;
		await ready.current;
		const current = widget.current;
		if (!current) throw new TurnstileError();

		const token = await new Promise<string>((resolve, reject) => {
			pending.current?.reject(new TurnstileError());
			pending.current = { resolve, reject };
			if (current.used) current.api.reset(current.id);
			current.used = true;
			current.api.execute(current.id);
		});
		return { [CAPTCHA_HEADER]: token };
	}, [siteKey]);

	return { ref: setContainer, enabled: !!siteKey, getCaptchaHeaders };
}
