# Piano

A Windows piano practice app: Markdown lessons with ABC, MusicXML and
MIDI inside, played along on a MIDI piano with a score and falling notes.
Plain HTML, CSS and JS with **no build step**, vendored music libraries,
in a Tauri window. Started from keel's template.

## Before anything

- `git pull --ff-only` first.
- Read **CONTRIBUTING.md** (the rules for every change, the notes files,
  versions and releases), **ARCHITECTURE.md** (the map and the traps) and
  **RULES.md** (keel's rules that stop bugs and drift). Below is only
  what's specific to Claude sessions.

## Shipping

- Windows only. No phone apps, no web deploy, no release until Daniel
  says "release". A merge with a new APP_VERSION publishes the release
  (`desktop.yml`); a zip to try things is built by running it by hand.
- Lines for the changelog go in `changes/<branch>.md`, never CHANGELOG.md.
- Check a change in a browser with a simulated piano (the computer's
  keyboard or `PianoApp` in the console), not only the tests.
- Shared files come from keel (danielnoam/keel): change them there, then
  sync with `node tools/keel-sync.js v<x.y.z>` in its own change.

## Branch names

- Don't use the claude/... branch the session was handed. Make a branch
  named for the change: fix/<what>, feature/<what> or docs/<what>.

## Working with Daniel

- Be direct. Push back when an idea or plan is weak, and say what was
  checked and what is a guess.
- Any security or privacy trade-off: say it plainly and write it in
  ARCHITECTURE.md's Trade-offs.
