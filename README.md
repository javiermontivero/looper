<div align="center">
  <img src="public/icon.svg" width="72" height="72" alt="">
  <h1>Looper</h1>
  <p><strong>Pick a sound. Play a part. Build a song.</strong></p>
  <p>A browser MIDI looper for the <strong>MIDIPLUS MiniControl</strong>.<br>Made for jamming on your phone or computer.</p>
  <p><a href="https://javiermontivero.github.io/looper/"><strong>▶ Open Looper</strong></a> · <a href="GUIDE.md">User guide</a></p>
</div>

## What’s inside

- 🎹 **Hundreds of sounds** — piano, bass, strings, drums and more, plus FM synth presets.
- 🔁 **7 loop tracks + master** — record, overdub and mute parts without losing their place.
- 🎛️ **Hands-on control** — browse instruments, launch loops and shape effects from your MiniControl.
- ✨ **8 effect slots per track and master** — filters, EQ, delay, reverb, tremolo, distortion and volume/pan.
- 🥁 **Stay in time** — visible count-in, metronome and adjustable loop lengths with reversible trimming.
- 💾 **Pick up where you left off** — your session saves locally in the browser.

## Your first loop

1. **Connect** your USB MIDI keyboard and [open Looper](https://javiermontivero.github.io/looper/). Chrome on Android is the main target; desktop works too.
2. **Tap Activar**, allow MIDI access, choose a sound and wait for it to load.
3. **Tap Grabar** on track 2. Follow the two-bar count-in, then play.
4. **Tap Cerrar** to finish. Your recording starts looping.
5. **Add another track**, choose a new sound and build on it. Later takes wait for the next loop start.

Try **120 BPM and four bars** for your first part. Use **Clic** for the metronome, or **Overdub** to layer more sound into an existing track.

**No MIDI keyboard?** On a computer, try `A W S E D F T G Y H U J K` to play notes.

> The interface is currently in Spanish. **Activar** = enable audio, **Grabar** = record, **Cerrar** = finish recording. Wait for **Guardado local** before reloading.

## MiniControl at a glance

Set **keys and CC controls to channel 1**. Set **pads to channel 10**, note/PAD mode, notes **30–45** in order. Pads must send a note-off when released.

| Control | What it does |
| --- | --- |
| Pad 1 | Select master; press again to pause/resume |
| Pads 2–8 | Select a track; press again to record/finish, or mute/unmute an existing loop |
| Hold a selected track pad | Clear its recording after 1 second |
| Pads 9–16 | Select one of the current track’s eight effect slots |
| CC13 / CC14 | Browse category / instrument |
| With an effect selected | CC15 chooses the effect; CC13 / CC14 adjust its two parameters |
| CC7 slider | Master volume |

Knobs use **absolute CC mode**; Looper turns each movement into a relative step. The first movement sets the reference. Press a track pad to leave effect editing.

Generic USB MIDI keyboards can play the sounds too. Use the screen controls, or configure the same mapping. [Full controls and recording guide →](GUIDE.md)

## A few things to know

Samples need internet to load. Sessions stay in this browser and on this site; they are not cloud backups. Recording currently captures the built-in instruments, not a microphone or USB audio input. Changing BPM changes both loop speed and pitch.

## Run it yourself

With Node.js 22+:

```sh
git clone https://github.com/javiermontivero/looper.git
cd looper
npm ci
npm start
```

Open **http://localhost:8080/**. Phone access needs [HTTPS](HTTPS.md).

## Built with

- **smplr** — sampled instruments.
- **Tone.js** — mixing and effects.
- **Playwright** — browser regression tests.
- **Node.js** — local static-file server; the published app runs entirely in your browser.

[Sound credits](public/sounds.html) · [Tests](TESTING.md) · [Deploy to Pages](PAGES.md) · [Audio architecture](AUDIO.md)
