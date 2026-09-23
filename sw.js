const CACHE='fit-diary-v4-85-splash';
const ASSETS=[
  './',
  './index.html',
  './splash.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './fit-diary-logo.png'
];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;

  const url=new URL(e.request.url);
  const scopePath=new URL(self.registration.scope).pathname;
  const rootPath=scopePath.endsWith('/')?scopePath:scopePath+'/';
  const isRootNavigation=
    e.request.mode==='navigate' &&
    url.origin===self.location.origin &&
    (url.pathname===rootPath || url.pathname===rootPath+'index.html');

  if(isRootNavigation && !url.searchParams.has('skipSplash')){
    e.respondWith(caches.match('./splash.html').then(r=>r||fetch('./splash.html')));
    return;
  }

  e.respondWith(
    fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return r;
    }).catch(()=>caches.match(e.request).then(r=>{
      if(r)return r;
      if(e.request.mode==='navigate')return caches.match('./index.html');
    }))
  );
});
