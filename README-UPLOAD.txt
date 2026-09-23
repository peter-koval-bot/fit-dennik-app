FIT DIARY — SMART CALORIES v4.87

Upload BOTH files to the ROOT of peter-koval-bot/fit-dennik-app in one commit:

1) fit-diary-calorie-ai.js   (new file)
2) sw.js                     (replace the existing sw.js)

Do NOT replace index.html, splash.html or manifest.webmanifest.

After upload:
- fully close Fit Diary on iPhone
- open it once, close it again
- open it a second time if the old service worker is still active

New feature:
- Smart Calories button inside the logged-in app
- food calories + macros
- free Open Food Facts barcode lookup
- BMR (Mifflin-St Jeor / Katch-McArdle when body fat % is known)
- TDEE base outside training
- strength-training calorie estimate with a realistic range
- adaptive Smart calibration from logged intake and body-weight trend
- personal calculation data stored locally on the device

No paid AI API is required for this version.
