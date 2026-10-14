# Audio engine

The engine uses Tone.js **15.1.22**, smplr **1.1.0**, and one native
AudioContext. This is a structural migration: MIDI mappings, effects, patch
IDs, envelopes, velocity, loop timing, and session format remain unchanged.

## Ownership and signal flow

```text
InstrumentSource.output ─► AudioEngine.bus ─┬─► capture ─► LoopProcessor input
                                         └─► selected track FX (or master FX)
LoopProcessor outputs 1…7 ─► track FX ─► master FX ─► safety ─► CC7 ─► speakers
LoopProcessor output 0 (metronome) ────► master FX
Diagnostic click ───────────────────────────────────────────► CC7
```

- `tone-runtime.js` loads a pinned, single-file UMD bundle from jsDelivr on
  activation, with a timeout and retry after download failure. CSP permits only
  that additional script URL. No bundler or server dependency is required.
- `AudioEngine` owns the shared context, dry bus, mixer, memoryless peak safety,
  master gain and diagnostic click. It resumes the native context in the user
  gesture before waiting for Tone. Initialization failure closes that context.
- `InstrumentSource` composes the existing native two-operator FM voice engine
  and smplr, rather than inheriting the entire monitor/master graph from a synth.
  It owns voice release and cancellable sample downloads.
- A replaceable source supplies `{output: AudioNode}` from the engine's native
  context. `setSource` connects/disconnects exactly that source; it does not
  own or dispose it. Callers own source cleanup. Capture and monitor do not
  depend on MIDI, patch loading or smplr. This is the seam for a future external
  input; microphone permissions, input selection and MediaStream capture are
  deliberately not implemented.
- `EffectChain` uses Tone Gain, Panner, BiquadFilter, Delay, Convolver,
  Oscillator and WaveShaper. Native boundary ports connect to smplr/worklet.
  The existing impulse response, distortion curve, linear dry/wet mix,
  smoothing and parameter ranges are retained. Panner explicitly preserves
  native stereo/mono channel handling.
- `LoopCore` and `LoopProcessor` retain the single sample clock, dry capture,
  overdub, per-track outputs and snapshot protocol. No independent Transport,
  Player or MediaRecorder clock is introduced. The worklet reuses its routing
  array rather than allocating it every quantum.
- All library nodes are explicitly tied to the same Tone Context, with
  `lookAhead: 0`. Notes use native `currentTime`. Tone's callback ticker uses
  a 50 ms timeout interval; it does not schedule MIDI notes or loop boundaries.
  There is no extra audio buffer or scheduling delay from this setting.

FM remains the original native algorithm to preserve its timbre, envelopes and
voice cost. Replacing it with Tone.FMSynth/PolySynth, or smplr with Tone.Sampler,
would be a separate sonic/product change. Likewise Tone.Reverb's random impulse
would not preserve the existing seeded impulse.

Effects and output ownership are now independent of instrument ownership.
Disposal releases nodes, FM release tails, samplers and pending downloads.
The worklet's obsolete closing state and legacy track-volume command are gone;
volume is exclusively the optional effect plus the master output slider.
No UI/session migration is needed.

## Validation

`node --test` runs offline routing/lifecycle, MIDI, instrument, persistence and
sample-clock regression tests. Tone doubles exercise ownership and connections;
they are not DSP simulations.

`tests/browser/audio-check.html` uses the real pinned Tone bundle and native
OfflineAudioContext. Serve the repository root with a static HTTP server (for
example `python3 -m http.server 8000`) and open
`http://localhost:8000/tests/browser/audio-check.html`. Click Ejecutar.
It does not touch sessions, MIDI or microphone and produces no audible playback.

The fixture compares both stereo channels against the frozen pre-refactor
effect graph at 44.1 and 48 kHz, including live parameter edits and an eight-effect
chain reordered mid-render. It also checks independent source routing and FM.
The reference in tests/browser is test-only, not a second production engine.
These fixtures are outside public/ and are not included in Pages.

Real USB MIDI, recording and audible latency on Android still require device
testing over trusted HTTPS. Offline equivalence is not a mobile performance
benchmark. Tone does not remove the output buffering reported by Android.

Validation in Lab: 74 Node tests passed; 22 real-browser offline checks passed.
Tested effects and edits matched the reference sample-for-sample at both rates.
This covers those signals/configurations, not every possible input or device.
