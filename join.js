// Handles the membership application form submission.
// Imported and routed to by worker.js -- see that file for routing.

import { addToMailchimp } from "./mailchimp.js";

export async function handleJoin(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const required = ["tier", "amount", "orgName", "segment", "address", "contactName", "contactEmail", "printName", "signature", "signDate"];
  for (const field of required) {
    if (!data[field]) {
      return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(data.contactEmail)) {
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

  const row = (label, value) => `<p><strong>${label}:</strong> ${escapeHtml(value) || "&mdash;"}</p>`;

  const emailBody = `
    <h2>New SCEA Membership Application</h2>

    <h3>Membership Selected</h3>
    ${row("Tier", data.tier)}
    ${row("Amount Due", `$${data.amount}`)}

    <h3>Organization Information</h3>
    ${row("Business / Organization Name", data.orgName)}
    ${row("Industry / Segment", data.segment)}
    ${row("Address", data.address)}
    ${row("Business Phone", data.orgPhone)}
    ${row("Business Website", data.orgWebsite)}

    <h3>Primary Contact</h3>
    ${row("Name", data.contactName)}
    ${row("Title / Role", data.contactTitle)}
    ${row("Email", data.contactEmail)}
    ${row("Phone", data.contactPhone)}

    <h3>Authorization</h3>
    ${row("Print Name", data.printName)}
    ${row("Title", data.authTitle)}
    ${row("Signature (typed)", data.signature)}
    ${row("Date", data.signDate)}

    <p style="margin-top:20px; color:#666;">Payment: not processed via this form &mdash; applicant was instructed to mail a check or contact info@scequinealliance.com.</p>
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
        reply_to: data.contactEmail,
        subject: `New ${data.tier} application ($${data.amount}): ${data.orgName}`,
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

    // Add to Mailchimp with the "Member" tag, which triggers the membership
    // welcome automation. Runs after the application email above succeeds;
    // failures here don't block the application -- Resend is the critical path.
    try {
      await addToMailchimp({
        email: data.contactEmail,
        mergeFields: {
          FNAME: data.contactName,
          PHONE: data.contactPhone,
          COMPANY: data.orgName
        },
        tag: "Member",
        env
      });
    } catch (mcErr) {
      // Logged (but not re-thrown) -- the application is already received
      // and emailed either way.
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
