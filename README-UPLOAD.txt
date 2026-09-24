FIT DIARY v4.88 — NATÍVNE SMART KALÓRIE

Nahraj do ROOTu repozitára peter-koval-bot/fit-dennik-app iba tieto 2 súbory:

1) index.html  — NAHRAĎ existujúci index.html
2) sw.js       — NAHRAĎ existujúci sw.js

Nemeň splash.html ani manifest.webmanifest.
Súbor fit-diary-calorie-ai.js môže zostať v repozitári; v4.88 ho už nenačítava a nepoužíva.

Čo sa zmenilo:
- žiadne extra SMART tlačidlo a žiadna druhá databáza údajov
- výpočty používajú existujúci profil zo Supabase (pohlavie, vek, výška, aktivita, cieľ)
- používajú už zapísané jedlá, kroky, silové tréningy, kardio a hmotnosť
- BMR: Mifflin–St Jeor
- silový tréning: odhad podľa času + počtu sérií/hustoty tréningu s realistickým rozsahom
- kardio: čistý výdaj nad pokojový metabolizmus; ručne zadané kcal sa rešpektujú
- kroky: odhad podľa výšky, hmotnosti a počtu krokov; beh/chôdza z kardia sa nepočíta dvakrát
- adaptívny Smart maintenance/TDEE sa po dostatku dát kalibruje z reálneho príjmu a trendu hmotnosti
- nový výpočet je priamo na Domove a v detailoch histórie
- čiarový kód v Jedle používa bezplatnú databázu Open Food Facts
- doterajšie dáta, účet, cloud a fotky sa nemenia

Po nahratí:
- Fit Diary úplne zavri a otvor znova.
- Pri prvom štarte môže iPhone ešte použiť starý service worker; ak treba, zavri a otvor appku ešte raz.

Poznámka k presnosti:
Kalórie spálené tréningom a denný energetický výdaj sú vždy odhady. V4.88 preto zobrazuje rozsah pri silovom tréningu a pri adaptívnom TDEE aj stav kalibrácie.
