// Handles the newsletter signup form (homepage + Get Involved page).
// Imported and routed to by worker.js -- see that file for routing.

import { addToMailchimp, ZIP_MERGE_TAG } from "./mailchimp.js";

export async function handleSubscribe(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { name, email, zip, phone } = data || {};

  if (!name || !email || !zip || !phone) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

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
    String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const emailBody = `
    <h2>New SCEA Newsletter Signup</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Zip Code:</strong> ${escapeHtml(zip)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "SCEA Website <info@scequinealliance.com>",
        to: ["info@scequinealliance.com"],
        reply_to: email,
        subject: `New newsletter signup: ${name}`,
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

    // Add to Mailchimp with the "Newsletter" tag, which triggers the
    // subscriber welcome automation. This runs after the notification email
    // above succeeds, and failures here don't block the form -- Resend is
    // the critical path.
    try {
      await addToMailchimp({
        email,
        mergeFields: {
          FNAME: name,
          PHONE: phone,
          [ZIP_MERGE_TAG]: zip
        },
        tag: "Newsletter",
        env
      });
    } catch (mcErr) {
      // Logged (but not re-thrown) -- the person still gets confirmation
      // their signup went through, and we already have their info via email.
      console.error("Mailchimp call threw an exception:", String(mcErr), mcErr && mcErr.stack);
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
