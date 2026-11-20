# Piano

A piano practice app for Windows: lessons written as Markdown files with
the music inside them, played along on a MIDI piano, shown as a score and
as falling notes over a keyboard. Personal, not published.

Plain HTML, CSS and JS with **no build step**, run in a Tauri window. The
music libraries are vendored under `src/vendor/` (abcjs, OpenSheetMusicDisplay,
markdown-it). Started from keel's template; the files `keel.lock.json`
lists come from keel.

## Run it

```sh
node server.js          # http://localhost:5173, in Chrome or Edge (Web MIDI)
node test/run-all.js    # the tests
```

The Windows app is a zip: Actions → **Windows app** → Run workflow, then
download `Piano-<version>-windows` from the run, unzip it anywhere and
run `Piano.exe`. No installer. It isn't signed, so the first start shows
SmartScreen's "More info → Run anyway".

## Lessons

A course is a folder of `.md` files. Add one with **Add folder**; the app
watches it and reloads a lesson when you save it in your editor.

- A ```` ```abc ```` block is a practice block: the app draws it and you
  play it. Options go after the language: ```` ```abc tempo=60 hands=right loop ````.
- A link to a `.musicxml`, `.mxl` or `.mid` file is a piece card.
- Front matter (`--- tempo: 80 ---`) sets the lesson's defaults.
- Options: `tempo`, `speed` (0.5 or 50%), `hands` (right, left, both),
  `mode` (wait, flow), `loop`, `bars` (5-8), `metronome`, `transpose`.

`lessons/getting-started/` is the built-in course and the example.

## Features

### Practice
- Wait mode stops at each note until you play it; flow mode keeps time
  and counts what you miss.
- Each hand is yours, the app's (played to your piano or the built-in
  sound) or off.
- Speed 25 to 150 %, loops by dragging over bars, metronome, count-in.
- Auto speed-up: each clean pass of a loop goes 5% faster, up to a goal.
- Transpose up or down a semitone at a time (ABC scores redraw in the new
  key; MusicXML keeps its written one).
- Tempo changes in MusicXML are followed.
- MIDI files: each track is the right hand, the left, split at middle C, or
  left out, kept per file.
- Timing calibration: tap along with clicks and the delay between hearing
  a note and the app getting yours is taken off when judging.
- Free play, with the chord you hold named, and recording anything you
  play as a MIDI file.
- A practice plan per piece: sections, each hand then both, 60% up to full
  speed, then the whole piece; a clean loop pass moves you on.

### Writing and reading
- A lesson editor beside the lesson, with the lesson as its live preview.
  Turn on **Notes from the piano** and what you play is written into the
  music block at the cursor (chords too). Saves to your folder, or as a
  copy for built-in lessons; unsaved text is kept as a draft.
- Drills, new music each time: sight-reading (hands, key, range, rhythm),
  scales (major and harmonic minor in every key, with fingering where the
  usual one fits), I–IV–V–I chords in every key, rhythm only (any key
  plays it, timing counts), and by ear (the app plays, you play it back).
- Today's practice: a warm-up scale in the key of the day, a drill in that
  key, then your piece, timed to your daily goal.
- Two built-in courses: Getting started, and A first year (25 lessons on
  reading, rhythm, scales and chords).

### Progress
- Each run and loop pass: right, late, missed, wrong, and how far off the
  beat. Per piece: best tempo, runs, time practised and the bars that trip
  you up, shaded on the score, with a button to loop one.
- Minutes per day for the last two weeks, a daily goal, and days in a row
  that met it.
- Your last take: hear it with or without the music, a timing graph of
  each note, and loud and soft against the p and f marks.
- Time to review: learned pieces come back after 1, 3, 7, 14, 30 and 60
  days.

### Seeing it
- The score (abcjs for ABC, OpenSheetMusicDisplay for MusicXML) follows
  along and marks each note hit, late or missed.
- Falling notes over a keyboard, coloured by hand, lighting the keys you
  press.
- Note names (letters or solfège) and finger numbers on the falling notes.
- A PDF book in its own panel, keeping your page.
- Panels you drag, resize, hide and show, with presets.
- Glow and sparks on the keys (subtle, full or off; off when Windows asks
  for less motion).
- A video (WebM) of the falling notes with the app's sound.
- Light and dark themes, and a colour editor for both, with a readability
  check and colours you can copy and paste.

### Playing it
- Any MIDI piano (Web MIDI), with the app's notes sent back to it.
- No piano: the computer's keyboard (A W S E D … from middle C, Z and X
  for octaves) or a click on the keys.
- A recorded grand piano (the Salamander Grand Piano by Alexander Holm,
  CC-BY 3.0, in `src/sounds/piano/`), or a lighter made sound, with a
  sustain pedal and a little room.
- Shortcuts you can change, on the computer's keys or on piano keys you
  never play.
- Keyboards with lit keys: the next notes light up, on the lighting
  channel you pick (untested: which channel depends on the keyboard).
