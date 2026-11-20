# Contributing to Piano

The rules for everyone who works on Piano, people and Claude sessions
alike. CLAUDE.md adds only what is specific to Claude.

## Getting started

```sh
node server.js          # http://localhost:5173
node test/run-all.js    # the whole test suite
```

Read ARCHITECTURE.md (the map), DROPPED.md (what was turned down) and
CHANGELOG.md before proposing anything, so nothing shipped or turned down
comes back.

## Decisions that are already made

- **Windows only, for one person.** The app is a Tauri window on the
  same files the browser runs. No phone apps, no web deploy, no name yet.
- **No build step.** Plain files, served as they are. Libraries are
  vendored under `src/vendor/` with their licence beside them, never
  pulled from npm at run time. `package.json` is only the Tauri CLI.
- **One set of files.** `tools/build-www.js` copies sw.js's ASSETS into
  `www-desktop/` for Tauri, so a file the app loads must be in ASSETS.
- **Shared files come from keel.** `src/keel/`, `server.js` and the
  `tools/` keel lists are never edited here (`test/keel.test.js` fails if
  they are).

## Rules for every change

**Security and privacy, as far as it can go.** For every change ask what
it sends, to whom, and what a page, file or other site could do with it.
Least access, nothing leaves the device unless the person turned it on,
and any trade-off is said plainly and written in ARCHITECTURE.md's
Trade-offs. The page's Content-Security-Policy stays strict
(`test/csp.test.js`): no inline script or handler. Style attributes are
allowed only because the score libraries need them; our code doesn't
write any.

**Windows and the browser.** It works in the Windows app and in Chrome
or Edge (Web MIDI), from 900 px wide. A Tauri permission or plugin is
added in `src-tauri/` with its reason beside it.

**English only, for now.** Words go through `t()` so a second language
stays possible, but none is required.

**Design.** Colours are tokens in `src/styles.css`, every theme passes
WCAG AA (`test/contrast.test.js`), click targets are at least 32 px, and every
animation has a reduced-motion answer. Moves go through keel's motion
(`Piano.motion`), which turns each into a short fade under reduced
motion; a CSS transition uses its `--spring-*` variables.

**RULES.md.** The rules that stop bugs and drift (motion, components,
words, saving, state, timers, tests) come from keel and hold for every
change. `test/motion.test.js` and `test/waits.test.js` check the ones a
test can.

**Speed.** Drawing is one requestAnimationFrame loop that stops when
nothing moves; nothing allocates per frame in roll.js. The engine stays
pure (time in, events out) so it's tested without a browser.

**Ask first for big things.** A new look, a reworked screen or a big
change is shown or explained to Daniel first and waits for his OK.

## Keeping the notes files right

- A change a person can notice adds a note in `changes/` (see its
  README). Only a release writes CHANGELOG.md.
- A "no" becomes an entry in DROPPED.md with the reason.
- ARCHITECTURE.md changes in the same commit as the code it describes.
- Why goes in the commit message and the PR description.

## Versions and releases

- Releases happen only when Daniel says so. Until then work merges
  without a version bump and writes its lines to `changes/<branch>.md`.
- A release: `node tools/release.js x.y.z` changes APP_VERSION in
  `src/app.js`, every `?v=` in `index.html` and `CACHE` in `sw.js`, and
  folds `changes/` into CHANGELOG.md. New feature: minor; fix: patch.
- The Windows zip is built by hand: Actions → Windows app → Run
  workflow. That leaves the run's artifacts only. A merge to main with a
  new APP_VERSION publishes the `app-v<version>` release (zip, Piano.exe,
  Piano.exe.sig) by itself; the in-app updater reads it.
