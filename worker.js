/* Same-origin bridge for the Space Music PWA. The upstream API allows simple
 * GETs but rejects CORS preflight for the signed headers the client sends, so
 * browser traffic goes through this Worker instead. Native clients are unaffected. */
const UPSTREAM = "https://api.tryliner.fun";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const target = new URL(request.url);
      target.protocol = "https:";
      target.host = "api.tryliner.fun";
      target.pathname = url.pathname.slice("/api".length) || "/";

      const headers = new Headers(request.headers);
      headers.delete("host");

      return fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
    }

    return env.ASSETS.fetch(request);
  },
};
