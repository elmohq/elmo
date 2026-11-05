import { describe, expect, it } from "vitest";
import {
	invitationEmail,
	passwordResetEmail,
	paymentFailedEmail,
	paymentRecoveredEmail,
	subscriptionEndedEmail,
	verificationEmail,
} from "./email-templates";

const URL = "https://app.example.com/verify?token=abc123";

describe("verificationEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = verificationEmail({ url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});

describe("passwordResetEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = passwordResetEmail({ url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});

describe("invitationEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = invitationEmail({ inviterName: "Ana", orgName: "Acme", url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});

	it("escapes user-controlled strings in the html body", () => {
		const email = invitationEmail({
			inviterName: "<script>alert(1)</script>",
			orgName: "Acme & Co",
			url: "https://x",
		});
		expect(email.html).toContain("&lt;script&gt;");
		expect(email.html).not.toContain("<script>alert");
		expect(email.html).toContain("Acme &amp; Co");
	});
});

describe("paymentFailedEmail", () => {
	it("includes the url and the grace window in html and text", () => {
		const email = paymentFailedEmail({ orgName: "Acme", graceDays: 9, url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
		expect(email.html).toContain("9 days");
		expect(email.text).toContain("9 days");
	});

	it("escapes the organization name in the html body", () => {
		const email = paymentFailedEmail({ orgName: "Acme & Co", graceDays: 7, url: URL });
		expect(email.html).toContain("Acme &amp; Co");
	});
});

describe("paymentRecoveredEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = paymentRecoveredEmail({ orgName: "Acme", url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});

describe("subscriptionEndedEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = subscriptionEndedEmail({ orgName: "Acme", url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});
