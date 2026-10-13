// Cloudflare Pages Function
// Deploys automatically at /api/create-checkout when this file lives at
// /functions/api/create-checkout.js
//
// SETUP REQUIRED before this works:
// 1. In the Stripe Dashboard, switch to Test mode (top-right toggle) to start.
// 2. Go to Developers -> API keys, copy the Secret key (starts with sk_test_...).
// 3. In Cloudflare Pages -> your project -> Settings -> Environment Variables, add:
//      STRIPE_SECRET_KEY = <that key>
//    (Add it for both "Production" and "Preview" environments.)
// 4. Redeploy. That's it.
// 5. When ready to accept real payments: switch Stripe to Live mode, copy the new
//    sk_live_... key, and replace the STRIPE_SECRET_KEY value in Cloudflare. No code
//    changes needed to go live.
//
// SECURITY NOTE: The dollar amount is determined here, server-side, from the tier
// name only -- never trusted from the client. This prevents someone from tampering
// with the page to submit a lower amount than their selected tier.

const TIER_AMOUNTS = {
  "Individual": 2000,        // amounts in cents
  "Organization": 6000,
  "Founding Sponsor": 20000
};

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { tier, contactEmail, orgName } = data || {};

  if (!tier || !TIER_AMOUNTS.hasOwnProperty(tier)) {
    return new Response(JSON.stringify({ error: "Invalid or missing membership tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Payment processing is not configured yet" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const amount = TIER_AMOUNTS[tier];
  const origin = new URL(request.url).origin;

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("payment_method_types[0]", "card");
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", `SCEA Membership — ${tier}`);
  params.append("line_items[0][price_data][unit_amount]", String(amount));
  params.append("line_items[0][quantity]", "1");
  params.append("success_url", `${origin}/join.html?payment=success`);
  params.append("cancel_url", `${origin}/join.html?payment=cancelled`);
  if (contactEmail) params.append("customer_email", contactEmail);
  params.append("metadata[tier]", tier);
  if (orgName) params.append("metadata[orgName]", orgName);

  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: "Stripe error", detail: session }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
