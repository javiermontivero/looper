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

Product E2E regressions now run through the published app: `npm test`.
See [TESTING.md](TESTING.md) for setup, the old-to-new coverage map and limits.
The previous Node doubles and frozen reference graph have been retired.
The suite uses the real pinned libraries, native audio/worklets and storage,
observing final audio and UI rather than graph internals.

Real USB MIDI and audible latency on Android still require trusted HTTPS device
testing. Headless desktop audio is not a mobile performance benchmark.
Tone does not remove the output buffering reported by Android.
