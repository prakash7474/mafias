Add licensed/original sound files here. Audio is optional, never autoplays, and the site keeps working without it.

## Entrance sting

`mafias-smoke-intro.mp3` — the edited ~4.2 s swoosh that plays once, from zero,
when the visitor clicks **ENTER MAFIAS**. It is the only sound during the
entrance: every other Howl (background loop, thunder) is stopped on the same
click and stays stopped afterwards. The visual timeline never waits on it — if
the file is missing or the browser blocks playback, the sequence runs silently.

## Thunder

Thunder is played from **`thunder.mp3`** — a one-shot playback shaped per
strike by apparent distance (playback rate, brightness and gain), scheduled
about 100 ms after the visual flash. If the file is missing, `src/scene/thunder.js`
falls back to a synthesised Web Audio rumble (filtered noise + a low body
tone), so the site keeps working without it. It plays only after the visitor
switches SOUND on, is announced exactly once per strike (the background track
ducks briefly beneath it), never loops, and is silenced completely when SOUND
is off — the FLASH toggle controls the visuals independently of it.

## Registration transitions

`public/audio/registration/` holds seven one-shot cues used only by the
registration journey. They are played through `src/components/registrationAudio.js`,
which is the same Howler instance as the rest of the site — not a second audio
system. Background ambience (the looping drone, the entrance sting) is owned by
`src/App.jsx` and is never touched by this module.

| cue | file | original |
|---|---|---|
| scene change, forward | `transition-forward.mp3` | Mixkit #2623 "Ghostly whoosh passing" |
| scene change, back | `transition-back.mp3` | Mixkit #1088 "Tape rewind cinematic transition" |
| character portal opens | `portal-open.mp3` | Mixkit #2589 "Shot light energy flowing" |
| gender / tag selection | `select.mp3` | Mixkit #2568 "Cool interface click tone" |
| submit registration | `submit.mp3` | Mixkit #1143 "Cinematic whoosh deep impact" |
| confirmed registration | `success.mp3` | Mixkit #2290 "Epic orchestra transition" |
| SOUND switched on | `toggle.mp3` | Mixkit #3124 "Modern technology select" |

All seven come from <https://mixkit.co/free-sound-effects/> under the
**Mixkit Free License**: free for commercial and non-commercial projects, no
attribution required, but the files may not be redistributed as standalone
downloads — they are bundled here only as part of this site.

Behaviour: silent until SOUND is switched on (nothing is fetched before that),
each cue fades in and stops itself after its tail so a long file never bleeds
into the next scene, the same cue cannot retrigger inside its own gap, and
every cue is stopped when the journey unmounts. The confirmation cue only
plays in scene 05, which is only reached after the backend confirms the
registration.

Currently used by `src/App.jsx`:
- `Danny_Elfman_Wednesday_OST_-_Wednesday_Main_Titles_2022_(mp3.pm).mp3` — background loop (plays when SOUND is switched ON).
- `dark-drone.mp3` — optional fallback loop, used automatically if the file above is removed.
- `mafias-smoke-intro.mp3` — entrance sting (see above).
- `thunder.mp3` — thunder one-shots (see above).

Only ship audio you own or are licensed to use.
