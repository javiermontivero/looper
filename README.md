# Looper — a browser MIDI looper for MIDIPLUS MiniControl

Turn a USB MIDI keyboard into a live looping instrument on your phone or computer. Looper combines a sampler, an FM synthesizer, seven audio loop tracks and a master effects chain in a mobile-first web app.

Designed around the **MIDIPLUS MiniControl**, with dedicated pads for recording and effects and knobs for browsing sounds. Generic MIDI keyboards can play the instruments too; the on-screen controls work without the MiniControl mapping.

**[Open Looper on GitHub Pages](https://javiermontivero.github.io/looper/)** · [Controller setup](#midiplus-minicontrol-setup) · [Recording guide](#recording-and-loop-length) · [Development](#run-locally)

The app interface is currently in Spanish. This guide includes the labels you will see on screen. The published app follows releases and may lag behind the code in this branch.

## What you can do

- Play hundreds of sampled instrument variants: pianos, basses, strings, drums, percussion, Mellotron sounds and more, plus 12 original FM presets.
- Browse sounds by their role in a song, with one continuous list per category.
- Record **audio loops**, layer different instruments into the same track with overdub, and bring parts in and out while they stay in sync.
- Start with one audio track and add up to seven. Track 1 is always the master.
- Use a two-bar count-in, a four-bar recording guide, adjustable BPM and a metronome.
- Shorten a loop reversibly or extend its cycle with silence.
- Add up to eight effects per audio track and eight on the master.
- Reload and recover the last locally saved session.

All sound generation, recording, playback and effects run in your browser. The server serves static files; the app does not upload your recordings.

## Make your first loop

1. Connect your USB MIDI controller. On a phone, use a USB connection or adapter that supports host/OTG mode.
2. Open the app over **HTTPS**, tap **Activar** and grant MIDI access when asked. If needed, open **Ajustes** (⚙), choose your device under **Teclado MIDI**, and press **Conectar**.
3. Choose a musical category and a sound from the two dropdowns. Wait for the instrument to finish loading, then play a few notes.
4. Set the **BPM**. Press **Clic** to enable the metronome if you want it.
5. With the controller configured below, press **pad 2** once to select track 2. Release it, then press again to record. Alternatively, tap the track's **Grabar** button.
6. Follow the visible **two-bar count-in**. Start playing when **¡REC!** appears. Press the same pad again, or **Cerrar** on screen, to finish the take immediately.
7. Your take repeats, with silence added to complete its loop cycle. Choose another sound and another track to build the next part. Later recordings wait for the next start of the global loop.
8. Wait for **Guardado local** before reloading. A restored session starts paused: activate audio, then resume playback.

For a predictable first try, use **120 BPM** and play four bars in 4/4. The count-in lasts four seconds; the four-bar loop lasts eight seconds.

Without a MIDI device, you can try the instruments with a computer keyboard: `A W S E D F T G Y H U J K O L P ;` plays consecutive semitones starting at middle C. Click away from text fields and dropdowns first. **Esc** releases notes and pauses playback.

## MIDIPLUS MiniControl setup

Configure the controller in its editor and apply the configuration to the device:

| Control | Configuration |
| --- | --- |
| Piano keys | MIDI channel **1** |
| Knobs | MIDI channel **1**, **absolute CC** mode |
| Category knob | **CC13** |
| Instrument knob | **CC14** |
| Effect-type knob | **CC15** |
| Master-volume slider | MIDI channel **1**, **CC7**, absolute 0–127 |
| All 16 pads | **PAD/note mode**, MIDI channel **10** |
| Pad note numbers | Consecutive notes **30–45**, starting with pad 1 |

A pad must send **Note On with positive velocity when pressed**, and **Note Off or Note On with velocity 0 when released**. Release messages are required for repeated presses and hold-to-clear. Use note numbers, since octave names vary between controller editors.

Keeping pads on channel 10 leaves low notes on channel 1 available for bass instruments. **CC12 is unused.** No MIDI learning is needed for these fixed controls.

### Pads: tracks and effects

| Physical pad | MIDI note, channel 10 | Function |
| --- | --- | --- |
| 1 | 30 | Select master; press again to pause/resume all loops |
| 2–8 | 31–37 | Select/control audio tracks 2–8 |
| 9–16 | 38–45 | Select effect slots 1–8 on the current track or master |

**Selection comes first.** Pressing a different track pad selects that track without recording or toggling playback. If it does not exist, only that track is created: pad 8 does not create all the tracks in between. Release the pad before pressing again.

For an **already selected audio track**:

| Track state | Short press |
| --- | --- |
| Empty | Start the count-in or arm recording |
| Counting in or waiting | Cancel the pending recording |
| Recording | Close the take immediately |
| Contains audio | Toggle playback/mute |

Hold the selected audio-track pad for **about one second** to clear its recording. Master cannot be recorded into or cleared with a hold. To **overdub**, use the track's on-screen recording button; a pad press on a recorded track toggles mute.

While editing an effect, pressing a track pad first returns to instrument mode and selects the track. That press does not start recording or toggle playback, even if the track was already selected.

### Knobs: two modes

| Control | Instrument mode | Effect selected |
| --- | --- | --- |
| **CC13** | Previous/next musical category | Effect parameter 1 |
| **CC14** | Previous/next instrument | Effect parameter 2 |
| **CC15** | Unused | Effect type, including empty |
| **CC7** | Master output volume | Master output volume |

Select an effect with pads 9–16 or its on-screen slot. Return to instrument mode with a track pad or **×** in the effect editor.

The app converts **absolute CC values into relative steps**. The first message establishes a reference. Each subsequent increase moves forward one option; each decrease moves backward one option, regardless of the size of the change. Repeated 0 values keep moving backward, and repeated 127 values keep moving forward. Other repeated values are ignored.

Lists stop at their ends. There are **no instrument pages**. Each category remembers its last sound. The dropdown updates immediately; loading waits briefly for knob movement to stop.

Generic controllers can use the same messages. Settings also offers MIDI learning for previous/next sound; fixed controls take priority over learned assignments.

## Instruments and musical roles

Sounds are grouped by their function in a song, rather than by soundfont bank:

| Category shown in the app | Musical role |
| --- | --- |
| Base rítmica | Drums and rhythmic foundations |
| Bajos | Bass |
| Acompañamiento | Chords and accompaniment |
| Fondos | Pads and backgrounds |
| Melodías | Leads and melodies |
| Acentos y texturas | Accents and textures |

A sound can appear in several roles without duplicating its samples. Names include the bank or collection so you can distinguish different versions of an instrument.

The catalog includes:

- **128 General MIDI programs per bank** from FluidR3_GM, MusyngKite and FatBoy.
- smplr's published ElectricPiano, DrumMachine, DrumAbuse, Mallet, Mellotron, Smolken and Versilian catalogs.
- Splendid Grand Piano, Tabla and acoustic Hydrogen drums.
- **12 original two-operator FM presets**. This is not a DX7 or M-VAVE FM1 emulation.

Catalog availability can change with upstream collections; Versilian is experimental. The app loads only the selected instrument's samples, rather than downloading every bank. **Internet access is needed to load libraries and samples.** Notes played while an instrument is loading are not queued.

Velocity is supported, with a curve that makes soft playing more audible. Sustain and pitch bend work on pitched instruments; sampled instruments apply bend to new notes, while FM also bends held notes.

For the acoustic drum kit, play kick on MIDI **36/60**, snare on **38/62**, closed hi-hat on **42/66**, and open hi-hat on **46/70**. The higher mapping helps on small keyboards. Closing the hi-hat cuts the open hi-hat. Other drum collections may have different available pieces.

Collection-specific attribution and terms are available under **Ajustes → Sonidos y créditos → Fuentes y licencias**, and in [the sound credits](public/sounds.html). Sample collections have their own licenses.

## Recording and loop length

Tracks store **audio, not MIDI notes**. A track can contain several instruments layered with overdub; changing your selected preset does not change an existing recording.

### Timing and synchronization

- The visual base is **four bars of four beats**. It is a guide, not a maximum recording length.
- The first take in an empty session has a **two-bar count-in**, with visible beats and an automatic click.
- Later takes and overdubs wait for the next **global loop start**, defined by the longest completed track. **ESPERA** means recording is armed; press again to cancel.
- A new take can continue beyond the existing global loop length. Shorter tracks keep repeating while it records.
- Closing a take stops capture immediately. Its cycle rounds up to **1, 2, 4, 8, 16… bars**, filling the remainder with virtual silence. For example, seven recorded bars become an eight-bar cycle.
- Recordings shorter than 0.25 seconds are rejected. A track holds up to **60 seconds of original audio**; recording closes automatically at that limit.

Every track and the metronome use one shared audio sample clock. Muting a track preserves its phase: unmuting midway through a cycle plays from that position. Pausing the master freezes the shared position and closes an active take.

### Change a cycle without losing the original take

Open a track's **⋯** menu and use **‹ / ›** to choose a cycle from **1 to 128 bars**, in powers of two.

Shortening hides the end of the recording without deleting it. Lengthening reveals that audio again, then adds silence if needed. It does not duplicate or stretch the take.

A pending change appears as, for example, **8 → 16**, and takes effect at the next boundary shared by the old and new cycles. Selecting the current duration again cancels it. Recording and duration changes cannot be pending at the same time.

Overdub adds audio inside the chosen cycle and preserves any hidden audio beyond it. **Overdub has no undo.** If the cycle exceeds the 60-second recording capacity, shorten it before overdubbing.

### BPM and metronome

BPM ranges from **40 to 240** and is locked during a take, count-in or recording wait. **Clic** toggles the metronome, which follows the same clock and is never recorded.

Changing BPM changes the **speed and pitch of recorded loops**, like varispeed playback. It does not time-stretch audio to preserve pitch, detect tempo, or retune live notes.

## Effects and track volume

Every audio track and the master has **eight effect slots**, initially empty. Select a track, then an effect slot. Use **CC15** to choose an effect, **CC13** for its first parameter, and **CC14** for its second.

| Effect shown in the app | CC13: parameter 1 | CC14: parameter 2 |
| --- | --- | --- |
| Volumen / pan | Level | Stereo pan |
| Filtro suave | Low-pass cutoff | Resonance |
| Filtro de graves | High-pass cutoff | Resonance |
| Ecualizador | Bass | Treble |
| Delay | Delay time | Wet/dry mix |
| Reverb | Decay duration | Wet/dry mix |
| Tremolo | Rate | Depth |
| Distorsión | Drive | Wet/dry mix |

To balance a track, add **Volumen / pan** to that track. Its level starts at **70%**, corresponding to gain 1; lowering it attenuates, and raising it above 70% boosts. **CC7 always controls overall output**, independently of the selected track or effect.

Reorder slots with **← Antes / Después →** in the interface. Choose **Vacío** to remove an effect. Order matters, and changing or reordering effects clears their existing tails.

Recording captures the **dry instrument signal**. Track effects process playback, followed by the master chain, so you can change effects without rewriting the recording. Live playing is monitored through the selected track's chain, then master; with master selected, it goes directly through the master chain. Neither existing loop playback nor the metronome feeds back into recording.

## Local session recovery

The app automatically saves completed takes and session changes in this browser. It preserves audio, loop lengths and hidden portions, mute states, tempo, selected sounds/tracks and effect chains.

Audio and session data live in **IndexedDB**; localStorage holds legacy preferences and MIDI assignments. Wait for **Guardado local** before leaving or reloading. An open take or a save still in progress is not yet backed up.

Restored audio starts paused. **Nueva sesión** clears the current session after confirmation.

Storage belongs to the site's origin: **Lab and GitHub Pages have separate sessions**, as do HTTP and HTTPS addresses. There is no cloud sync or session export. Clearing site data or browser storage eviction can remove recordings, so local recovery is not an external backup.

## Browser support and troubleshooting

The primary target is **Chrome on Android**, with desktop keyboard support and automated regression testing in **Chromium**. Other browsers need Web MIDI and AudioWorklet support and suitable permissions; they are not covered by the automated browser suite.

Use trusted **HTTPS**, or localhost for development. Opening the HTML directly or visiting a phone-accessible server over plain HTTP is not the supported setup.

| Symptom | What to check |
| --- | --- |
| No sound | Tap **Activar**, wait for the instrument to load, check master volume, and select the MIDI input in **Ajustes**. |
| Keyboard plays, but pads do nothing | Pads must send notes 30–45 on **channel 10**. The first press selects; the next performs the action. |
| Pads play musical notes | Check the pad channel. Channel 1 is for playing the instrument; the reserved pad notes are on channel 10. |
| Hold-to-clear or repeated presses fail | Check that pads send a release message. Use momentary note/PAD mode. |
| First knob movement does nothing | It establishes the reference for relative navigation. Move it again. |
| Knobs edit effects instead of sounds | Return to instrument mode with a track pad or the effect editor's **×**. |
| Recording has not started | Look for the first-take count-in or **ESPERA**, which waits for the global loop boundary. |
| Sound downloads fail | Check connectivity; use **Ajustes → Sonidos y créditos → Actualizar catálogo** to retry catalog discovery. |
| Playback stops when switching apps | Losing focus pauses the looper and releases held notes. Keep the app in the foreground. |
| Reload loses recent changes | Check for **Guardado local** before reloading and make sure you reopened the same site/origin. |

For latency investigation, open **Ajustes → Rendimiento**. Compare the instrument against **MIDI con clic directo (prueba)** and **Probar clic táctil**, then turn diagnostic mode off to play normally. These measurements report browser timing, not physical key-to-speaker latency. Android/device output buffering still affects responsiveness; Tone.js does not remove it.

Current limits include no microphone or USB audio-interface capture, no MIDI-note editing, no audio/session export, no overdub undo, and no guaranteed offline mode. The engine has a source interface for future external audio input.

## Run locally

Use **Node.js 22+**:

```sh
git clone https://github.com/javiermontivero/looper.git
cd looper
npm ci
npm start
```

Open **http://localhost:8080/**. No frontend build step is required. A phone accessing this server needs HTTPS; see [HTTPS setup](HTTPS.md) (Spanish).

### Run product regressions

```sh
npx playwright install --with-deps chromium
npm test
```

The suite exercises the published UI with real Web Audio, Tone.js, smplr, AudioWorklet and IndexedDB. MIDI hardware and remote sample responses are simulated. It checks audible results, recording, synchronization, effects, controller behavior and session recovery.

The full run includes **1,000 continuous loop cycles** and takes about **26 minutes** in Lab. A shorter, incomplete development run is:

```sh
npm test -- --grep-invert @soak
```

Use `npm run test:ui` to investigate and `npm run test:report` to view the report. See [TESTING.md](TESTING.md) (Spanish) for the coverage map, Docker alternative and test boundaries. Real USB hardware, Android latency and the actual sample collections still need device testing.

### Architecture and deployment

- **Native JavaScript ES modules, HTML and CSS** provide the mobile interface.
- **Web MIDI** receives controller events.
- **smplr 1.1.0** loads sampled instruments; a native two-operator FM engine provides synth presets.
- **Tone.js 15.1.22** supplies mixer and effect components on the shared AudioContext.
- A custom **AudioWorklet** records and plays loops on a single sample clock.
- A **Worker and IndexedDB** persist sessions away from the UI thread.
- The small **Node.js static server** is for local/Lab hosting. GitHub Pages serves `public/` directly and needs no audio backend.

See [AUDIO.md](AUDIO.md) for signal flow, ownership and the future input-source interface.

GitHub Pages publishes after a **stable GitHub Release** or a manual workflow run, once the full regression suite passes. An ordinary push or a tag alone does not publish. Setup is documented in [PAGES.md](PAGES.md) (Spanish). In Lab, startup smoke checks run before deployment; the complete regression service runs separately and its result must be checked.
