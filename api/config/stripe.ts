import Stripe from "stripe";
import { config } from "./config";

// One shared Stripe client for the whole API, mirroring config/db.ts's
// single-pool pattern. apiVersion is pinned so a Stripe-side default bump
// can't silently change request/response shapes under us - update it
// deliberately alongside an SDK upgrade.
const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
});

export default stripe;
