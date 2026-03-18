import { SCALE } from '../constants.js';

// ─── Reverb ───────────────────────────────────────────────────────────────────
// Synthetic impulse response — no IR files needed.
// Call once after AudioContext is created, route masterGain through it.
export function createReverb(audioCtx, seconds = 2.8, decay = 2.2) {
  const convolver = audioCtx.createConvolver();
  const rate = audioCtx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // Exponentially decaying noise — classic synthetic reverb IR
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

// ─── Note dispatch ────────────────────────────────────────────────────────────
// volume: 0–1 multiplier  |  duration: seconds total (attack + sustain + decay)
export function playNote(audioCtx, masterGain, ballIndex, instrument, duration = 3, volume = 1.0) {
  if (!audioCtx) return;
  if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});

  const freq = SCALE[ballIndex % SCALE.length];
  try {
    switch (instrument) {
      case 'himalayanBowl': playHimalayanBowl(audioCtx, masterGain, freq, duration, volume); break;
      case 'crystalBowl':   playCrystalBowl(audioCtx, masterGain, freq, duration, volume); break;
      case 'marimba':       playMarimba(audioCtx, masterGain, freq, duration, volume); break;
      case 'hangDrum':      playHangDrum(audioCtx, masterGain, freq, duration, volume); break;
      default:              playSineBell(audioCtx, masterGain, freq, duration, volume); break;
    }
  } catch (e) {
    console.warn('audio error', e);
  }
}

// ─── Instruments ──────────────────────────────────────────────────────────────

function playSineBell(audioCtx, masterGain, freq, duration, volume) {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // ≥4ms attack — no harsh transient
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.5 * volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

// Himalayan bowl design principles:
//   • 0.22s attack (slow mallet strike)
//   • Inharmonic overtones at ~2.756× and ~5.27× fundamental (real metal bowl physics)
//   • Slow vibrato LFO — the characteristic "singing" resonance drift
//   • Partial ratios and vibrato rate vary with frequency so each note has its own character
function playHimalayanBowl(audioCtx, masterGain, freq, duration, volume) {
  const now = audioCtx.currentTime;

  // Frequency-dependent character: lower notes have wider, slower partials;
  // higher notes have tighter ratios and slightly faster vibrato.
  const t = (freq - 261.63) / (659.25 - 261.63); // 0 (low C4) → 1 (high E5)
  const p2ratio   = 2.756 + t * 0.08;   // 2nd partial: 2.756–2.836
  const p3ratio   = 5.27  + t * 0.18;   // 3rd partial: 5.27–5.45
  const vibRate1  = 0.42  + t * 0.20;   // fund vibrato: 0.42–0.62 Hz
  const vibRate2  = 0.58  + t * 0.18;   // 2nd partial vibrato: 0.58–0.76 Hz

  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(0.32 * volume, now + 0.22); // 220ms attack
  out.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  out.connect(masterGain);

  const partials = [
    { mult: 1,        vol: 1.00, vibRate: vibRate1, vibDepth: 0.0025 },
    { mult: p2ratio,  vol: 0.42, vibRate: vibRate2, vibDepth: 0.0018 },
    { mult: p3ratio,  vol: 0.12, vibRate: 0,        vibDepth: 0      }, // 3rd static
  ];

  partials.forEach(({ mult, vol, vibRate, vibDepth }) => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    oscGain.gain.value = vol;

    if (vibRate > 0) {
      const lfo = audioCtx.createOscillator();
      const lfoDepth = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = vibRate;
      lfoDepth.gain.value = freq * mult * vibDepth; // depth scales with partial freq
      lfo.connect(lfoDepth);
      lfoDepth.connect(osc.frequency);
      lfo.start(now);
      lfo.stop(now + duration);
    }

    osc.connect(oscGain);
    oscGain.connect(out);
    osc.start(now);
    osc.stop(now + duration);
  });
}

function playCrystalBowl(audioCtx, masterGain, freq, duration, volume) {
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.38 * volume, now + 0.006); // 6ms attack
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gain.connect(masterGain);
  [[1, 1.0], [2, 0.28]].forEach(([mult, vol]) => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    oscGain.gain.value = vol;
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  });
}

function playMarimba(audioCtx, masterGain, freq, duration, volume) {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  filter.type = 'bandpass';
  filter.frequency.value = freq * 2;
  filter.Q.value = 2;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.6 * volume, now + 0.004); // 4ms attack
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

function playHangDrum(audioCtx, masterGain, freq, duration, volume) {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.08, now);
  osc.frequency.exponentialRampToValueAtTime(freq, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.5 * volume, now + 0.008); // 8ms attack
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}
