// Shared helper for adding/updating a Mailchimp contact and applying a tag.
// Used by both subscribe.js (tag: "Newsletter") and join.js (tag: "Member").
//
// Both forms feed into the SAME Mailchimp audience -- per-form behavior (which
// welcome email fires) is controlled entirely by which tag gets applied here,
// matching the two automations already set up in Mailchimp (one per tag).

// TODO: Replace this with the real merge tag for your "Zip Code" field.
// Find it at: Mailchimp -> Audience -> Settings -> Audience fields and merge tags.
// It will look like "MMERGE7" or similar -- update the line below once you have it.
export const ZIP_MERGE_TAG = "MMERGE7";

// Pure-JS MD5 implementation -- required because Mailchimp's API identifies
// contacts by the MD5 hash of their lowercased email address, and Cloudflare
// Workers' built-in crypto functions don't support MD5 (only SHA).
function md5(str) {
  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
  function toBytes(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return bytes;
  }
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  let bytes = toBytes(str);
  const origLenBits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push((origLenBits / Math.pow(2, i * 8)) & 0xff);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) {
      M[i] = bytes[chunkStart + i*4] | (bytes[chunkStart + i*4+1] << 8) |
             (bytes[chunkStart + i*4+2] << 16) | (bytes[chunkStart + i*4+3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5*i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3*i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7*i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  function toHex(n) {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += ((n >> (i*8)) & 0xff).toString(16).padStart(2, "0");
    }
    return s;
  }
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

export async function addToMailchimp({ email, mergeFields, tag, env }) {
  if (!env.MAILCHIMP_API_KEY || !env.MAILCHIMP_AUDIENCE_ID || !env.MAILCHIMP_SERVER_PREFIX) {
    // Mailchimp isn't configured -- fail silently rather than blocking the
    // form. The email notification (Resend) is the critical path; Mailchimp
    // is a nice-to-have on top of it.
    return;
  }

  const prefix = env.MAILCHIMP_SERVER_PREFIX;
  const listId = env.MAILCHIMP_AUDIENCE_ID;
  const subscriberHash = md5(email.toLowerCase());
  const authHeader = "Basic " + btoa(`anystring:${env.MAILCHIMP_API_KEY}`);

  // Step 1: add or update the contact.
  await fetch(`https://${prefix}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`, {
    method: "PUT",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: mergeFields
    })
  });

  // Step 2: apply the tag, which triggers the matching welcome automation.
  await fetch(`https://${prefix}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}/tags`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tags: [{ name: tag, status: "active" }]
    })
  });
}
