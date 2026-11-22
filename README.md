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
| Set note lengths | Tap a length (whole to 1/32, or **dotted**) before tapping notes. It sticks until you change it; tap a written note to see or change its length |
| Copy, repeat, move | Tap **select** (or long-press the tab), tap more columns or **Whole bar**, then **Copy**, **Cut**, **Repeat**, **Clear** or **Delete**. **Paste** is in the selection bar and the **⋯** menu |
| Hear it | **▶** plays from the cursor at the song's tempo, following the note lengths |

Song details (title, artist, tuning, capo, tempo) are behind the title at the top.

## Changing the tuning

Tap the string names at the start of the tab (marked **TUNE**), or open **⋯ → Tuning**, or go to song details.

- Pick a preset: Standard, Drop D, half step down, D standard, Drop C, DADGAD, open G/D/E, 7-string, or 4- or 5-string bass.
- Or tune string by string with **−** / **+** (one semitone per tap). You hear each string as you change it, and any string you've changed shows how far it moved. **All strings** shifts the whole guitar.
- Tick **Keep notes sounding the same** to rewrite the fret numbers for the new tuning (e.g. in Drop D an open low E becomes fret 2). Leave it unticked to keep the fingering and change the sound.
- Going to more or fewer strings (7-string, bass) adds or removes the lowest strings.
- A retune can be undone like any other edit.

With a keyboard: digits enter frets (type `1` `2` quickly for 12), arrows move, `Space` steps on, `|` adds a bar line, `h p b r ~ x` apply techniques, `c` toggles chord mode, `Enter` plays, `Ctrl/⌘+Z` undoes. `Shift+←/→` selects, `Ctrl/⌘+A` selects the section, `Ctrl/⌘+C/X/V` copy, cut and paste, `Esc` ends a selection.

## Note lengths

Picking a length turns on rhythm display for that tab (you can switch it off in song details). When it's on:

- note and rest symbols appear under the tab, and columns are spaced by length, so longer notes take more room;
- PDF and TXT exports get proportional spacing and a rhythm line under each row: `W H Q E S T` for whole to 32nd, `.` for dotted, lowercase for a rest;
- playback follows the lengths at the song's tempo, with or without the display.

Stepping right with **→** past the last note leaves a rest of the current length. Tabs written before lengths existed play as eighth notes, which is how they sounded before.

## Copy and paste

The copied columns are saved, so you can paste into another section or another tab later, even after closing the app. Copying also puts the riff on the phone's clipboard as plain ASCII tab, ready to paste into a message. Pasting into a tab with a different number of strings adds or drops the lowest strings. **Repeat** inserts a copy right after the selection and selects the copy, so tapping it again keeps repeating.

## Export

- **PDF**: A4 or US Letter. Courier tab with aligned chord names, rows that wrap at bar lines, page numbers, and a legend for the techniques you used. The PDF is generated in the browser, so it works offline.
- **TXT**: classic ASCII tab at 60–120 characters per line, ready to paste into a forum or a text file.

On phones that support it, **Share…** sends the file straight to Files, Drive, Messages and so on.

## Saving

There's no account and no server: everything is kept in the browser's `localStorage` on your device, saved automatically as you go.

- **Tabs**: every edit, saved within a moment and again when you switch away from the app.
- **Where you were**: the tab you had open, the cursor position, any selection, the current note length, scroll positions, and the full undo/redo history (the most recent 60 steps).
- **Clipboard**: whatever you last copied or cut. Close the app, come back, and you're exactly where you left off, and undo still works.
- **Preferences**: input panel, Notes/Chord mode, sound on/off, panel collapsed, and export settings.

The app asks the browser to treat its storage as persistent, so it isn't cleared to free up space. Clearing site data or using a private window will still remove it, and tabs don't sync between devices.

## Running locally

```sh
npm start          # node server.js, then open http://localhost:8080
npm test           # node's built-in test runner, no install needed
```

To try it on your phone, open your computer's LAN address (e.g. `http://192.168.1.20:8080`) on the same Wi-Fi network. Offline mode and "Add to Home Screen" need HTTPS, so test those on the deployed site.

## Deploying (Railway)

`server.js` is a dependency-free Node static server. It listens on `$PORT`, serves only the app's files (`index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`), and adds gzip, ETags and security headers. `railway.json` tells Railway how to start it and to health-check `/healthz`.

1. In Railway: **New Project → Deploy from GitHub repo**, and pick this repo.
2. In the service's **Settings → Source**, set the branch Railway deploys from (e.g. `main`). Optionally turn on **Wait for CI** so a deploy only happens after the GitHub test workflow passes.
3. Under **Settings → Networking**, click **Generate Domain** to get an HTTPS `*.up.railway.app` URL, or add your own domain.

No environment variables, database or volume are needed: tabs live in each user's browser storage, so redeploying never touches them. Every push to the deploy branch redeploys.

Any other Node host works the same way (`npm start`), and so does any static host serving the files listed above.

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
js/glyphs.js          note and rest symbols (inline SVG)
js/storage.js         localStorage persistence (tabs, sessions, preferences)
sw.js                 offline cache
tests/                node:test unit tests
server.js             static server for Railway / any Node host
railway.json          Railway start command + health check
```
