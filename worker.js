// This is the single entry point Cloudflare runs for every request to your site.
// It checks the URL: if it's one of our three API routes, it runs the matching
// handler. Otherwise, it falls through to serving your static HTML/images/etc.
// exactly as before.

import { handleContact } from "./contact.js";
import { handleJoin } from "./join.js";
import { handleCreateCheckout } from "./create-checkout.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "POST" && pathname === "/api/contact") {
      return handleContact(request, env);
    }
    if (request.method === "POST" && pathname === "/api/join") {
      return handleJoin(request, env);
    }
    if (request.method === "POST" && pathname === "/api/create-checkout") {
      return handleCreateCheckout(request, env);
    }

    // Not an API route -- serve the static site as usual.
    return env.ASSETS.fetch(request);
  }
};
