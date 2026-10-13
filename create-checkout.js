// Creates a Stripe Checkout Session for the selected membership tier.
// Imported and routed to by worker.js -- see that file for routing.
//
// SECURITY NOTE: The dollar amount is determined here, server-side, from the tier
// name only -- never trusted from the client.

const TIER_AMOUNTS = {
  "Individual": 2000,        // amounts in cents
  "Organization": 6000,
  "Founding Sponsor": 20000
};

export async function handleCreateCheckout(request, env) {
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
