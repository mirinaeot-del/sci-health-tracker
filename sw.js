/* =========================================================
   sw.js — Service Worker (PWA 오프라인 지원)
   앱 셸(정적 파일)을 캐시하여 오프라인에서도 동작하게 한다.
   파일을 수정하면 CACHE 버전을 올려 캐시를 갱신한다.
   ========================================================= */
var CACHE = "sci-health-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./survey-data.js",
  "./storage.js",
  "./app.js",
  "./logo.svg",
  "./icon.svg",
  "./icon-maskable.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 네트워크 우선, 실패 시 캐시 (최신성 + 오프라인 양립) */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
