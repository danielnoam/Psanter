# Piano architecture

The map of the code. A file added, removed or renamed, or a flow changed,
is updated here in the same change.

## How it fits

A lesson is Markdown. `app.js` renders it with markdown-it; each `abc`
block and each piece link becomes something you can start. Starting one
calls `practice.load(target)`, which:

1. draws the score with an adapter from `score.js` (abcjs or OSMD), which
   also returns the **song**: notes `{midi, ms, dur, hand, finger, tied, measure}`
   grouped into steps by `music.song()`;
2. hands the song to the **engine**, a pure state machine: time comes in
   (`update(now)`, `noteOn(midi, now)`), events come out (`drain()`), so
   the tests replay it without a browser;
3. turns the events into sound (`synth.js` or MIDI out), score marks and
   falling notes (`roll.js`, `timeline.js`), drawn in one
   requestAnimationFrame loop that stops when nothing moves.

## Files

```
index.html           the page: its Content-Security-Policy first, then the scripts in load order
manifest.json        the web app manifest
icon.svg             the app icon
sw.js                the service worker: the files for offline use (ASSETS)
src/app.js           the app: screens, lesson rendering, transport, settings; APP_VERSION
src/styles.css       the tokens per theme, then the styles
src/icons.js         Lucide icons, one map
src/music.js         note names, the song model (steps, beats, bars), transpose
src/midifile.js      reads and writes Standard MIDI Files
src/lesson.js        front matter, block options, links: everything about lesson text
src/engine.js        the practice engine: wait/flow, hands, loops, metronome, results
src/midi.js          Web MIDI in and out, and the computer keyboard as a piano
src/synth.js         the built-in sound (Web Audio)
src/score.js         score adapters: abcjs, OSMD, none; each returns a song
src/roll.js          falling notes and the keyboard, one canvas
src/timeline.js      the bars strip: seek, drag a loop
src/layout.js        the panel split tree: normalise, place, resize, render
src/library.js       courses: built-in, folders (File System Access), single files
src/practice.js      one practice session: engine + score + roll + sound
src/vendor/          abcjs, osmd, markdown-it, pdfjs, each with its licence
src/keel/            from keel: errlog, platform, i18n, releases, motion (+ unused qr, github, drive)
lessons/             the built-in course; index.json lists the courses
test/                engine, lesson, layout and keel's checks; run-all.js runs them
server.js            the local server: this computer only (from keel)
tools/build-www.js   copies sw.js's ASSETS into www-desktop/ for Tauri
tools/               release.js, keel-sync.js, keel-checks.js (from keel)
package.json         the Tauri CLI only
src-tauri/           the Windows app: one window on the same files, MIDI allowed
.github/workflows/   tests; desktop.yml builds the Windows zip by hand
```

www-desktop/ and src-tauri's icons are made in CI, never committed.

The files listed in `keel.lock.json` come from keel and are never edited
here: fix them in keel, release it, then `node tools/keel-sync.js v<x.y.z>`.

## Trade-offs

- **`style-src 'unsafe-inline'`.** abcjs and OSMD set style attributes on
  the SVG they draw, and OSMD uses `new Function`. Scripts stay `'self'`
  only, so injected script still can't run; injected styles could.
  `test/csp.test.js` expects exactly these findings and no others.
- **MIDI is granted without asking** in the Windows app
  (`main.rs`, `on_permission_request`). The window only ever loads the
  app's own files.
- **Folders are read and written through File System Access.** The app
  keeps the folder handles in IndexedDB; Windows asks again after a
  restart when the permission lapsed.
- **No updater, no installer.** A new version is a new zip.
- **English only.** keel's i18n is loaded but there is no second language.
- **Vendored libraries** (~2.5 MB) instead of a bundle, so there's still
  no build step. Updating one is replacing its file.

## Traps

- OSMD's `halfTone` is MIDI − 12; its timestamps are in whole notes.
- abcjs note timings are matched to notes by `startChar`, not by order.
- Wait mode credits the next required note even when pressed early and
  jumps the song to it; flow mode only within 250 ms.
- `.abc-preview svg` must keep abcjs's own height, or the preview
  collapses.
