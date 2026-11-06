import Stripe from "stripe";

let client: Stripe | null = null;

/** Built lazily, so importing billing with dummy env (the mode smoke test) needs no key. */
export function getStripeClient(): Stripe {
	if (!client) {
		const key = process.env.STRIPE_SECRET_KEY;
		if (!key) throw new Error("STRIPE_SECRET_KEY must be set for cloud billing");
		client = new Stripe(key);
	}
	return client;
}
