# Changelog

Every release of Piano, newest first, in words a person using it would
use. Written only by `node tools/release.js x.y.z`, from the notes in
`changes/`.

## [1.1.0] - 2026-11-22

### Added
- Settings → About → Updates has a switch for checking for updates when the app starts. It's on by default; turned off, Psanter only checks when you press Check now.
- Find music, in the library: search the Mutopia Project's free piano music (public domain or Creative Commons) by title, keyword or composer, and download a piece into one of your folders. It arrives as a lesson with the MIDI file to practise, the sheet music as a PDF beside it, and where it came from and its licence. A list of good places to start (Bach's minuets, Schumann's Album for the Young, Clementi's sonatinas, Satie and more) searches with one click. Windows app only.
- A Search IMSLP button opens IMSLP's search in your browser, for scores that are only PDFs.
- Find music can also search the PDMX collection: about 3,800 rated solo piano scores shared on MuseScore, classical, folk, film and game music alike. Get it once from Find music (it downloads about 2.1 GB from Zenodo and keeps around 75 MB), then search by title, composer or genre and by level with no connection, and add a piece to one of your folders as a MusicXML lesson. Windows app only.
- Piano → Piano controls: change your piano's own tone, volume, ambience, brilliance, key touch, split and dual, transpose, tuning and metronome from the app, in a panel beside it. Roland pianos that speak Roland's app protocol get all of it (known on the FP-10 and FP-30, tried on any Roland); other keyboards get tone, volume and reverb over standard MIDI.
- "What the piano sends" in the same panel logs what the piano reports when you press its buttons, to map a model the app doesn't know yet.
- A piece can remember the piano's tone, touch and keyboard mode, and a lesson can set them with `tone:` and `touch:` in its front matter. The piano goes back to how it was when you return to the library.
- A warning when your piano's own transpose isn't 0, since the notes it sends are then shifted and judged wrong. Piano → Set the piano's transpose to 0 fixes it.
- The app's hand can play in its own sound on your piano (Settings → Piano → The app's hand sounds like).
- The soft and middle pedals can be shortcuts, like a piano key (Settings → Shortcuts).
- For other keyboards: named tones for the Yamaha P-125/P-121 and Kawai ES110 from their MIDI manuals, plus master volume and tuning that most keyboards take.
- Recital mode: play a whole piece without stopping for points, a combo that multiplies them for notes in a row, and up to five stars from how much was right. The best stars for each piece show in the library.
- Watch and listen: the app plays the piece, both hands, while you follow the score and the falling notes. A hand set to off stays quiet.
- Songs, a third built-in course: Twinkle, Twinkle; Frère Jacques as a round; Amazing Grace; Auld Lang Syne; Greensleeves; the opening of Für Elise; Canon in D; and the first bars of Bach's Prelude in C, each in an easy two-hand arrangement.
- Recording in layers: after a take, Practice → Record a layer plays it back while you record another part over it, saved together as one MIDI file.

### Changed
- With the switch on, Psanter checks for a new version every time it starts, not once a day.
- The app is now called Psanter: the window title, About, the exe (Psanter.exe) and the zip (Psanter-<version>-windows). Your settings, progress and the Data folder carry over: put Psanter.exe in the folder that holds your Data folder, or copy that folder (and piano-data.json, if you have one) next to the new exe. The 1.0.0 updater looks for Piano.exe, so it won't find this version; download it by hand once.
- Settings opens from one button, the sliders icon at the top right (or File → Settings, Ctrl+,). The extra Settings button at the bottom of the library sidebar is gone, and the piano status at the bottom left is now just a status.
- All sound settings are on the Sound page: where the app's notes play, the app's hand's sound and "Play my notes in the app too" moved there from the Piano page.
- Saving and loading a copy of your progress moved from Settings to the library's Progress page, beside the progress itself.

### Fixed
- Links to other sites (Search IMSLP, What's new, the PDMX page and links in lessons) did nothing in the Windows app. They open in your browser now.

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
