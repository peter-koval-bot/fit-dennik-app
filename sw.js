const CACHE='fit-diary-v4-92-admin-analytics';
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
  './fit-diary-logo.png',
  './privacy-health.html'
];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

function patchAppHtml(html){
  html=html.replace('<body class="locked">','<body class="locked auth-checking">');
  const pending='\n<style id="fd-auth-flash-fix">body.auth-checking .gate{visibility:hidden!important}</style>\n';
  html=html.replace('</head>',pending+'</head>');
  html=html.replace('function showAuth(msg="",type="info"){','function showAuth(msg="",type="info"){document.body.classList.remove("auth-checking");');
  html=html.replace('function showApp(){','function showApp(){document.body.classList.remove("auth-checking");');
  html=html.replace('function showOnboarding(profile=null,edit=false){','function showOnboarding(profile=null,edit=false){document.body.classList.remove("auth-checking");');
  html=html.replace('</body>','<script>setTimeout(()=>document.body.classList.remove("auth-checking"),5000);<\/script></body>');
  return html;
}

async function appResponse(request){
  try{
    const network=await fetch(request);
    if(network&&network.ok){
      const copy=network.clone();caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{});
      const type=network.headers.get('content-type')||'';
      if(type.includes('text/html')){
        const text=await network.text();
        return new Response(patchAppHtml(text),{status:network.status,statusText:network.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      }
      return network;
    }
    return network;
  }catch(err){
    const cached=await caches.match('./index.html');
    if(cached){const text=await cached.text();return new Response(patchAppHtml(text),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}
    throw err;
  }
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url),scopePath=new URL(self.registration.scope).pathname,rootPath=scopePath.endsWith('/')?scopePath:scopePath+'/';
  const isAppNavigation=e.request.mode==='navigate'&&url.origin===self.location.origin&&(url.pathname===rootPath||url.pathname===rootPath+'index.html');
  if(isAppNavigation&&!url.searchParams.has('skipSplash')){e.respondWith(caches.match('./splash.html').then(r=>r||fetch('./splash.html')));return}
  if(isAppNavigation&&url.searchParams.has('skipSplash')){e.respondWith(appResponse(e.request));return}
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):undefined))));
});
