FIT DIARY — SPLASH SCREEN UPDATE

Files:
- splash.html = new opening screen with the man, Fit Diary branding and animated blue loading bar
- manifest.webmanifest = changes PWA start URL to splash.html
- sw.js = shows splash on root launch, then allows the app through with ?skipSplash=1

Upload these 3 files to the ROOT of the repository fit-dennik-app and replace manifest.webmanifest and sw.js.
Do NOT replace index.html.

The existing app/data/storage are not modified by this update.
