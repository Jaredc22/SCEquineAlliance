// Cloudflare Pages Function
// Deploys automatically at /api/contact when this file lives at /functions/api/contact.js
//
// SETUP REQUIRED before this works:
// 1. Create a free account at https://resend.com
// 2. Verify your sending domain (scequinealliance.com) in Resend — this proves you own the
//    domain so Resend will actually deliver mail "from" it instead of getting flagged as spam.
// 3. Create an API key in Resend.
// 4. In the Cloudflare Pages dashboard: Settings -> Environment variables, add:
//      RESEND_API_KEY = <your key>
//    (Add it for both "Production" and "Preview" environments.)
// 5. Redeploy. That's it — no other code changes needed.

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

  const { name, email, message } = data || {};

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // basic email sanity check
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email service is not configured yet" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const emailBody = `
    <h2>New message from the SCEA website contact form</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // "from" MUST be an address on a domain you've verified in Resend.
        // Update this once scequinealliance.com is verified there.
        from: "SCEA Website <contact@scequinealliance.com>",
        to: ["info@scequinealliance.com"],
        reply_to: email,
        subject: `New contact form message from ${name}`,
        html: emailBody
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return new Response(JSON.stringify({ error: "Email send failed", detail: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
