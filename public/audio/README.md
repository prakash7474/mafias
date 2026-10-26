Add licensed/original sound files here. Audio is optional, never autoplays, and the site keeps working without it.

## Thunder

Thunder is **synthesised in the browser** by `src/scene/thunder.js` (Web Audio:
filtered noise + a low body tone, shaped per strike by apparent distance), so
no licensed asset is required and nothing is downloaded. It plays only after
the visitor switches SOUND on, is delayed to match the strike distance (about
3 s per km, capped), and is silenced completely when SOUND is off — the
FLASH toggle controls the visuals independently of it.

Currently used by `src/App.jsx`:
- `Danny_Elfman_Wednesday_OST_-_Wednesday_Main_Titles_2022_(mp3.pm).mp3` — background loop (plays when SOUND is switched ON).
- `dark-drone.mp3` — optional fallback loop, used automatically if the file above is removed.
- `graveyard-whoosh.mp3` — optional one-shot played on ENTER MAFIAS.

Only ship audio you own or are licensed to use.