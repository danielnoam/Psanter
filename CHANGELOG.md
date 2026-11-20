# Changelog

Every release of Piano, newest first, in words a person using it would
use. Written only by `node tools/release.js x.y.z`, from the notes in
`changes/`.

## [1.0.0] - 2026-11-20

### Added
- Touch response for your keyboard (light, normal, heavy or fixed), a floor for presses too light to count, and each key counted once when Windows lists the keyboard twice. In Settings, Piano.
- A delay check in Settings, Piano: how long a key takes to reach the app, the sound's buffer and Windows' output, added up.
- MIDI files with one track for both hands are split by working out which hand can reach each note, not cut at middle C.
- Chords above the falling notes while a piece plays: the last one, the one now and the next. Can be turned off in Settings, Practice.
- MIDI files open where the music starts, with empty bars at the start left out. The file isn't changed.
- A practice plan for any piece: it goes section by section, each hand alone then both, from 60% to full speed, then the whole piece. A clean loop pass moves you on, and it remembers where you were.
- Chord names in free play: what you hold is named, with its inversion (C/E, G7, Am7).
- Loud and soft: after a run, how well your dynamics followed the p and f marks, and the bars that were too loud or too soft. Your keyboard's touch is taken into account.
- Your last take: hear it again with the music or on its own, and a timing graph of every note, early or late, with whether you tend to rush or drag.
- Time to review: pieces you've learned come back in the library after 1, 3, 7, 14, 30 and 60 days.
- A lesson on loud and soft in A first year.
- A portable Windows app: your settings and progress live in a Data folder beside Piano.exe, so the folder can move or go on a USB stick. Settings → About can keep them in AppData or another folder instead (the data is copied over and the app restarts).
- Updates in place: the app checks for a new version once a day (or Help → Check for updates), shows it in the status bar, and replaces Piano.exe with it after checking its signature.
- Lessons as Markdown files: ABC blocks you can play, MusicXML and MIDI pieces, a built-in getting-started course.
- Courses from your own folders, reloaded when you save a lesson.
- Practice with a MIDI piano, the computer's keyboard or the mouse: wait and flow modes, each hand yours, the app's or off, speed, loops, metronome and count-in.
- The score follows along and marks notes hit, late or missed; falling notes over a keyboard.
- Resizable panels, light and dark themes.
- The Windows app as a zip: unzip and run, no installer.
- A recorded grand piano (Salamander Grand Piano, CC-BY 3.0) as the app's own sound, with the old made sound still in Settings → Sound.
- Today's practice: a warm-up scale in the key of the day, a sight-reading drill in that key, then the piece you were on, timed to your daily goal.
- More drills: scales (major and harmonic minor, one or two octaves, with the usual fingering where it applies) and I–IV–V–I chords in every key, rhythm only (any key plays the note), and playing back by ear.
- A second built-in course, A first year: 25 lessons on reading, rhythm, scales and chords.
- Timing calibration: Settings → Piano → Measure taps along with clicks and sets the delay your notes are judged with.
- MIDI files show their tracks, and each can be the right hand, the left, split at middle C, or left out. The choice is kept per file.
- The bars that trip you up are shaded on the score.
- A progress panel: this run's numbers, recent passes, each piece's best tempo, time practised and weakest bars (loop one with a click), and minutes per day.
- A PDF book beside the lesson (`book:` in the front matter, or a link to a page), remembering your page.
- Note names and finger numbers on the falling notes.
- A layout editor: drag panels by name, hide and show them, presets.
- A colour editor for the light and dark themes, with a readability check and copy-paste colours.
- Transpose, and auto speed-up on clean loop passes.
- Free play, and recording what you play as a MIDI file.
- Shortcuts you can change, including piano keys as shortcuts.
- A lesson editor with the lesson as its live preview; notes you play on the piano are written into the music at the cursor.
- Sight-reading drills: new music each time, for the hands, key, range and rhythm you pick.
- Glow and sparks on the keys, a daily goal with days in a row, and a video of the falling notes with the app's sound.
- Lit keys for keyboards that have them, on a channel you pick.

### Changed
- A new desktop look: dark by default, compact, square controls, with a light theme in View or Settings, Look.
- A menu bar (File, View, Practice, Drills, Help) with each shortcut beside its command. Alt and a menu's first letter opens it, the arrows move, Esc closes.
- The play controls are a toolbar at the top: the bar you're on, speed as a number, mode and hands as lists, key, record. The timeline sits under it.
- A status bar at the bottom: your piano, what to play next and today's minutes.
- The practice screen is docked panels with title bars: the lesson on the left, the score as a page above the keys, progress on the right. Your saved layout is reset once to this one.
- The library is a table of lessons and pieces with when you last practised, best tempo and review, and a details pane for the one you pick. Double-click or Enter opens it.
- The library's side has pages for review, today's practice, drills, progress and free play.
- Notes are timed from when your keyboard's message arrived, so timing is judged a little more exactly.
- The app's sound reaches the speakers about 6 ms sooner.
- A keyboard listed as several ports shows once, by its name.
- Settings has a page per topic (Piano, Practice, Sound, Shortcuts, Look, Your progress, About), each setting a row with a short note on what it does, and switches instead of checkboxes. It now also sets how loud the hand the app plays is, and lists the credits.
- Data from an earlier copy of the app (in AppData) is copied beside Piano.exe on the first start.
- Transposing an ABC exercise redraws the score in the new key. MusicXML still keeps its written key.
- A fuller built-in piano sound, with the sustain pedal and a little room.
- The timeline runs the full width above the controls.
- Small headings like "This run" and the groups in Settings are in sentence case, without the wide letter spacing.
- Lists of details read with commas ("Bar 3, 40% trouble") instead of dots between them.
- Shadows and the dimmed background behind dialogs follow the theme, so dark mode gets darker ones.

### Fixed
- MusicXML pieces with tempo changes now follow them, in the falling notes, the metronome and the judging.
- The Windows download from a build run is one zip with Piano.exe inside, not a zip inside a zip.

## [0.1.0] - 2026-11-17

### Added
- The first version: an empty app that works offline in the browser.
