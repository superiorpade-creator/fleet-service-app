// Minimal service worker - primarily exists so Chrome/Android consider this
// app "installable" (a fetch handler is one of their install criteria).
// Deliberately does NOT cache pages/data - this is a business app where
// crew and admins always need fresh data, not a stale cached version.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
