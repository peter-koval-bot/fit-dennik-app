FIT DIARY v4.89 — CAMERA BARCODE + MEDIA ACCESS

Na GitHub v koreni repozitára nahraď iba tieto 2 súbory:
1) index.html
2) sw.js

Nemeň:
- splash.html
- manifest.webmanifest
- ikony a logo

Čo pribudlo:
- V Jedlo → Pridať je pri čiarovom kóde tlačidlo „📷 Skenovať“.
- Skener používa zadnú kameru a po načítaní EAN/UPC automaticky vyhľadá produkt cez Open Food Facts.
- Ak prehliadač podporuje natívny BarcodeDetector, použije sa bez ďalšej knižnice.
- Inak sa pri otvorení skenera načíta bezplatná open-source ZXing knižnica z CDN. Ak nie je internet, stále funguje ručné zadanie EAN/UPC.
- V Ciele a nastavenia pribudla karta „Kamera a fotky“.
- Kamera: tlačidlo vyžiada/otestuje prístup a stream hneď zastaví.
- Fotky: iPhone/web nemá trvalé oprávnenie k celej fotoknižnici; tlačidlo otvorí systémový výber konkrétnej fotky a overí, že prístup funguje.

Existujúce účty, jedlá, tréningy, merania, progres a cloud dáta sa nemenia.
