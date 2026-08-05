import Stripe from "stripe";

export function createCloudStripeClient(secretKey = process.env.STRIPE_SECRET_KEY): Stripe {
	if (!secretKey?.trim()) throw new Error("STRIPE_SECRET_KEY must be set for cloud billing");
	return new Stripe(secretKey, { appInfo: { name: "Elmo Cloud" } });
}
