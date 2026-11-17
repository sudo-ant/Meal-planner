const CACHE_NAME = "maia-meal-planner-v2-18";
// Only retire names this project used in previous service workers.
const OBSOLETE_CACHE_NAMES = new Set([
  ...[2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(version => `maia-meal-planner-v2-${version}`),
  ...["1", "2", "3", "31", "4", "4-fixed", "5", "51", "51-fixed", "53-plan-details",
    "54-details-fixed", "55", "56", "56-fixed"].map(version => `student-food-planner-v${version}`)
]);
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "data/recipes.json",
  "data/ingredients.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(asset => new Request(asset, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && OBSOLETE_CACHE_NAMES.has(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request, { cacheName: CACHE_NAME }).then(cached => cached || fetch(event.request))
  );
});
