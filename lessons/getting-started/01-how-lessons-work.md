---
title: How lessons work
---

# How lessons work

A lesson is a Markdown file. Text is text; music in it is something you can
play. Press **Practice** on any music block and it opens in the score, with
the falling notes and the keyboard under it.

## Try it

Play these three notes. The score waits for each one: that's **wait
mode**, and it's on by default.

```abc practice: tempo=60 hands=right
X:1
T:Three notes
M:4/4
L:1/4
Q:1/4=60
K:C
!1!C !2!D !3!E2 |]
```

No piano connected? The computer's keyboard plays: **A** is middle C, the
row **A S D F G H J K** is the white keys, **W E T Y U** the black ones,
and **Z** and **X** move an octave down and up.

## The controls

- **Space** starts and stops. **Home** goes back to the start.
- **Wait** or **Flow**: wait for each note, or keep going and score what
  you play.
- **Speed**: slow it down until it's clean, then bring it back up.
- **Loop**: drag across bars in the timeline to repeat them.
- **Hands**: play one hand while the app plays the other.

## Your own lessons

Add a folder in the library and every `.md` file in it is a lesson. Write
music in an `abc` block for short exercises, or link a MusicXML or MIDI
file for whole pieces:

```markdown
[Minuet in G](pieces/minuet-in-g.musicxml "practice tempo=80 hands=right")
```

Lessons in a folder update here as soon as you save them in your editor.
