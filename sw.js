/* =========================================================
   sw.js — Service Worker (PWA 오프라인 지원)
   앱 셸(정적 파일)을 캐시하여 오프라인에서도 동작하게 한다.
   파일을 수정하면 CACHE 버전을 올려 캐시를 갱신한다.
   ⚠️ Supabase API/인증 요청과 외부 CDN은 캐시하지 않는다(항상 네트워크).
   ========================================================= */
var CACHE = "sci-health-v18";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./survey-data.js",
  "./supabase-config.js",
  "./auth.js",
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

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = e.request.url;
  // Supabase(API/Auth) 및 외부 CDN 요청은 캐시 개입 없이 네트워크로 직행
  if (url.indexOf("supabase.co") >= 0 || url.indexOf("supabase.in") >= 0 ||
      url.indexOf("jsdelivr.net") >= 0 || url.indexOf("cdn.") >= 0) {
    return; // 기본 네트워크 처리
  }
  // 같은 출처 정적 자산만: 네트워크 우선, 실패 시 캐시
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
