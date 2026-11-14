// Service Worker für "Meran Bus Live".
// Ziel: App startet sofort (auch bei schlechtem Netz), Live-Daten kommen IMMER frisch aus dem Netz.
// Gecacht werden nur die eigenen App-Dateien und die drei Bibliotheken (Karte, Zip-Entpacker).
// Live-Feeds, Fahrplan-Download und Kartenkacheln werden NICHT angefasst.
var VERSION = "v1";
var CACHE = "meran-bus-live-" + VERSION;
var OWN_FILES = [
  "index.html", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png"
];
var CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // Jede Datei einzeln und fehlertolerant: ein blockiertes CDN darf die Installation nicht verhindern.
      var jobs = OWN_FILES.map(function(f){ return cache.add(f).catch(function(){}); });
      CDN_FILES.forEach(function(u){
        jobs.push(fetch(new Request(u, { mode: "no-cors" })).then(function(r){ return cache.put(u, r); }).catch(function(){}));
      });
      return Promise.all(jobs);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf("meran-bus-live-") === 0 && k !== CACHE; })
                             .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function staleWhileRevalidate(cacheKey, request){
  return caches.open(CACHE).then(function(cache){
    return cache.match(cacheKey).then(function(cached){
      var network = fetch(request).then(function(resp){
        if (resp && resp.ok) cache.put(cacheKey, resp.clone());
        return resp;
      }).catch(function(){ return null; });
      // Sofort aus dem Cache antworten, im Hintergrund aktualisieren (neue Version erscheint beim nächsten Start).
      return cached || network.then(function(r){ return r || Response.error(); });
    });
  });
}

self.addEventListener("fetch", function(event){
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Eigene Dateien
  if (url.origin === self.location.origin){
    if (req.mode === "navigate"){
      var indexUrl = new URL("index.html", self.registration.scope).href;
      event.respondWith(staleWhileRevalidate(indexUrl, new Request(indexUrl, { cache: "no-cache" })));
      return;
    }
    if (url.href.indexOf(self.registration.scope) === 0 && url.pathname.indexOf("sw.js") === -1){
      event.respondWith(staleWhileRevalidate(req.url, req));
    }
    return;
  }

  // Bekannte Bibliotheken vom CDN: Cache zuerst
  if (CDN_FILES.indexOf(req.url) !== -1){
    event.respondWith(
      caches.match(req.url).then(function(hit){ return hit || fetch(req); })
    );
  }
  // Alles andere (Live-Daten, Fahrplan-Zip, Kartenkacheln): nicht eingreifen.
});
