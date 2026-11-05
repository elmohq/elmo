/** The Resend client is built lazily, so importing this with dummy env (the mode smoke test) needs no key. */
import { Resend } from "resend";
import type { EmailContent } from "./email-templates";

let client: Resend | null = null;

function getResendClient(): Resend {
	if (!client) client = new Resend(process.env.RESEND_API_KEY);
	return client;
}

export async function sendEmail(to: string, content: EmailContent): Promise<void> {
	const from = process.env.RESEND_FROM_EMAIL;
	if (!from) throw new Error("RESEND_FROM_EMAIL is not set");
	const { error } = await getResendClient().emails.send({ from, to, ...content });
	if (error) throw new Error(`Resend send failed: ${error.message}`);
}
