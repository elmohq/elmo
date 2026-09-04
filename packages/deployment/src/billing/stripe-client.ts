import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Lazy singleton so importing billing modules with dummy env stays safe (the
 * mode-compat smoke constructs cloud auth without a real key; nothing here
 * talks to Stripe until a request does).
 */
export function getStripeClient(): Stripe {
	if (!client) {
		const key = process.env.STRIPE_SECRET_KEY;
		if (!key) throw new Error("STRIPE_SECRET_KEY must be set for cloud billing");
		client = new Stripe(key);
	}
	return client;
}
