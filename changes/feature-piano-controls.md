### Added
- Piano → Piano controls: change your piano's own tone, volume, ambience, brilliance, key touch, split and dual, transpose, tuning and metronome from the app, in a panel beside it. Roland pianos that speak Roland's app protocol get all of it (known on the FP-10 and FP-30, tried on any Roland); other keyboards get tone, volume and reverb over standard MIDI.
- "What the piano sends" in the same panel logs what the piano reports when you press its buttons, to map a model the app doesn't know yet.
- A piece can remember the piano's tone, touch and keyboard mode, and a lesson can set them with `tone:` and `touch:` in its front matter. The piano goes back to how it was when you return to the library.
- A warning when your piano's own transpose isn't 0, since the notes it sends are then shifted and judged wrong. Piano → Set the piano's transpose to 0 fixes it.
- The app's hand can play in its own sound on your piano (Settings → Piano → The app's hand sounds like).
- The soft and middle pedals can be shortcuts, like a piano key (Settings → Shortcuts).
- For other keyboards: named tones for the Yamaha P-125/P-121 and Kawai ES110 from their MIDI manuals, plus master volume and tuning that most keyboards take.
