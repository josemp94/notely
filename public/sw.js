// Service worker de Notiono: instalabilidad + shell offline.
// - Mutaciones (no-GET) y /api/*: siempre a la red, sin tocar caché.
// - Estáticos inmutables (/_next/static, iconos, fuentes): cache-first.
// - Navegaciones: network-first con fallback a lo último cacheado (shell offline).
const VERSION = "v1";
const SHELL = `notiono-shell-${VERSION}`;
const STATIC = `notiono-static-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/login"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // mutaciones: red directa
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // datos: nunca desde caché

  // Estáticos con hash o inmutables: cache-first
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navegaciones: network-first, fallback al shell cacheado si no hay red
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
