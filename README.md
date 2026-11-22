# Guitarmageddon 🎸

A mobile-first guitar tab editor that runs in the browser. Tap the fretboard where your finger would go, hear the note, and export clean tabs as **PDF** or **TXT**.

No build step, no dependencies, works offline, and installs to your home screen.

## Writing tabs

| You want to… | Do this |
| --- | --- |
| Add a note | Tap the **fretboard** (or use the **Keypad**: pick a string, then a fret). The cursor moves on by itself. |
| Play a chord / several strings at once | Switch **Notes →** to **Chord ⇅**, tap several strings, then **→**. Or pick from the **Chords** tab (C, Am, G7, power chords…). |
| Hammer-on, pull-off, slide, bend | Tap the note, then `h` `p` `/` `\` `b` `r`, then tap the target fret → `5h7`, `7b9`, `5/7` |
| Vibrato, mute, harmonic, ghost note | `~`, `x`, `<>`, `( )` |
| Add a bar line or a gap | **\|** and **→** |
| Fix something | Tap any cell in the tab to select it; **⌫** clears it. Undo/redo are at the top. |
| Name a chord or write "PM" above the tab | Tap the **+** above the selected column |
| Organise the song | **+ Add section** (Intro, Verse, Chorus…); each section has a **⋯** menu and can hold notes or lyrics |
| Hear it | **▶** plays from the cursor at the song's tempo |

Song details (title, artist, tuning, capo, tempo) are behind the title at the top.

## Changing the tuning

Tap the string names at the start of the tab (marked **TUNE**), or open **⋯ → Tuning**, or go to song details.

- Pick a preset: Standard, Drop D, half step down, D standard, Drop C, DADGAD, open G/D/E, 7-string, or 4- or 5-string bass.
- Or tune string by string with **−** / **+** (one semitone per tap). You hear each string as you change it, and any string you've changed shows how far it moved. **All strings** shifts the whole guitar.
- Tick **Keep notes sounding the same** to rewrite the fret numbers for the new tuning (e.g. in Drop D an open low E becomes fret 2). Leave it unticked to keep the fingering and change the sound.
- Going to more or fewer strings (7-string, bass) adds or removes the lowest strings.
- A retune can be undone like any other edit.

With a keyboard: digits enter frets (type `1` `2` quickly for 12), arrows move, `Space` steps on, `|` adds a bar line, `h p b r ~ x` apply techniques, `c` toggles chord mode, `Enter` plays, `Ctrl/⌘+Z` undoes.

## Export

- **PDF**: A4 or US Letter. Courier tab with aligned chord names, rows that wrap at bar lines, page numbers, and a legend for the techniques you used. The PDF is generated in the browser, so it works offline.
- **TXT**: classic ASCII tab at 60–120 characters per line, ready to paste into a forum or a text file.

On phones that support it, **Share…** sends the file straight to Files, Drive, Messages and so on.

## Saving

There's no account and no server: everything is kept in the browser's `localStorage` on your device, saved automatically as you go.

- **Tabs**: every edit, saved within a moment and again when you switch away from the app.
- **Where you were**: the tab you had open, the cursor position, scroll positions, and the full undo/redo history (the most recent 60 steps). Close the app, come back, and you're exactly where you left off, and undo still works.
- **Preferences**: input panel, Notes/Chord mode, sound on/off, panel collapsed, and export settings.

The app asks the browser to treat its storage as persistent, so it isn't cleared to free up space. Clearing site data or using a private window will still remove it, and tabs don't sync between devices.

## Running locally

ES modules need to be served over HTTP:

```sh
npm start          # python3 -m http.server 8080, then open http://localhost:8080
npm test           # node's built-in test runner, no install needed
```

To try it on your phone, open your computer's LAN address (e.g. `http://192.168.1.20:8080`) on the same Wi-Fi network.

## Deploying

`.github/workflows/pages.yml` runs the tests and publishes the site to GitHub Pages on every push to `main`. Turn it on under **Settings → Pages → Source: GitHub Actions**. The app also works from any other static host.

## Project layout

```
index.html            app shell
css/styles.css        mobile-first styles, light and dark
js/app.js             UI: rendering, input panels, dialogs, export
js/editor.js          editing operations, cursor and undo (no DOM, unit tested)
js/model.js           song / section / column data model
js/tabtext.js         tab layout engine and TXT export (shared with the PDF)
js/pdf.js             dependency-free PDF writer
js/audio.js           plucked-string synth for previews and playback
js/tunings.js         tunings and note maths
js/chords.js          chord shapes
js/storage.js         localStorage persistence (tabs, sessions, preferences)
sw.js                 offline cache
tests/                node:test unit tests
```
