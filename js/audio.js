import { clamp, damp } from './style.js';

/**
 * All sound is synthesised at runtime: engine, wind, jets, horn and impacts.
 * There is deliberately no music and no voice track.
 */
export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineStarted = false;
    this.muted = localStorage.getItem('whitedust-muted') === '1';
    this.hornNodes = null;
    this.hornTimer = 0;
    this.currentSpeed = 0;
    this.airMix = 0;
    this.boostMix = 0;
  }

  async init() {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;

    this.master.connect(compressor);
    compressor.connect(this.context.destination);

    this.noiseBuffer = this.createNoiseBuffer(2.5);
    this.startEngineLoop();
    this.engineStarted = true;
  }

  createNoiseBuffer(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = 0.955 * last + 0.045 * white;
      data[i] = last * 3.4;
    }
    return buffer;
  }

  startEngineLoop() {
    const ctx = this.context;
    const now = ctx.currentTime;

    const engine = ctx.createGain();
    engine.gain.value = 0.0;
    engine.connect(this.master);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 380;
    lowpass.Q.value = 2.5;
    lowpass.connect(engine);

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 34;

    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = 51;
    growl.detune.value = -9;

    const buzz = ctx.createOscillator();
    buzz.type = 'square';
    buzz.frequency.value = 102;
    buzz.detune.value = 7;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.32;
    const growlGain = ctx.createGain();
    growlGain.gain.value = 0.3;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.055;

    sub.connect(subGain).connect(lowpass);
    growl.connect(growlGain).connect(lowpass);
    buzz.connect(buzzGain).connect(lowpass);

    // A slow irregular pulse keeps the idle from sounding synthetic.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 7.4;
    const lfoAmount = ctx.createGain();
    lfoAmount.gain.value = 0.035;
    lfo.connect(lfoAmount).connect(engine.gain);

    // Wind / airflow bed.
    const windSource = ctx.createBufferSource();
    windSource.buffer = this.noiseBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 720;
    windFilter.Q.value = 0.62;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.002;
    windSource.connect(windFilter).connect(windGain).connect(this.master);

    sub.start(now);
    growl.start(now);
    buzz.start(now);
    lfo.start(now);
    windSource.start(now);

    this.engine = { sub, growl, buzz, lowpass, engine, windFilter, windGain, lfo, lfoAmount };
  }

  update({ speed = 0, maxSpeed = 30, air = 0, boost = 0 }) {
    if (!this.context || !this.engine) return;
    const now = this.context.currentTime;
    const speedNorm = clamp(speed / Math.max(1, maxSpeed), 0, 1.4);
    this.currentSpeed = speedNorm;
    this.airMix = damp(this.airMix, air, 3, 1 / 60);
    this.boostMix = damp(this.boostMix, boost, 4, 1 / 60);

    const { sub, growl, buzz, lowpass, engine, windFilter, windGain, lfo } = this.engine;
    const base = 32 + speedNorm * 57 + boost * 12;
    sub.frequency.setTargetAtTime(base, now, 0.08);
    growl.frequency.setTargetAtTime(base * 1.47, now, 0.08);
    buzz.frequency.setTargetAtTime(base * 3.05 + 24, now, 0.07);
    lowpass.frequency.setTargetAtTime(230 + speedNorm * 620 + boost * 360 + air * 240, now, 0.1);
    lfo.frequency.setTargetAtTime(6.2 + speedNorm * 10, now, 0.12);

    const engineLevel = 0.042 + speedNorm * 0.012 + boost * 0.018 + air * 0.007;
    engine.gain.setTargetAtTime(engineLevel, now, 0.12);
    windGain.gain.setTargetAtTime(0.004 + speedNorm * 0.018 + air * 0.02 + boost * 0.02, now, 0.15);
    windFilter.frequency.setTargetAtTime(600 + speedNorm * 1500 + air * 900, now, 0.12);
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('whitedust-muted', muted ? '1' : '0');
    if (!this.context) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.context.currentTime, 0.03);
    if (muted) this.hornStop();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  hornStart() {
    if (!this.context || this.muted) return;
    if (this.hornNodes) return;
    const ctx = this.context;
    const now = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.16, now + 0.025);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1700;
    filter.Q.value = 0.8;
    filter.connect(bus);
    bus.connect(this.master);

    const notes = [392, 493.88];
    const oscillators = notes.map((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = index === 0 ? 'sawtooth' : 'square';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? -4 : 5;
      const gain = ctx.createGain();
      gain.gain.value = index === 0 ? 0.44 : 0.2;
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      return oscillator;
    });

    this.hornNodes = { bus, oscillators };
    clearTimeout(this.hornTimer);
    this.hornTimer = setTimeout(() => this.hornStop(), 2200);
  }

  hornStop() {
    if (!this.hornNodes || !this.context) return;
    const { bus, oscillators } = this.hornNodes;
    this.hornNodes = null;
    const now = this.context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(0.0001, now, 0.055);
    oscillators.forEach((oscillator) => {
      try {
        oscillator.stop(now + 0.24);
      } catch (error) {
        // Oscillator may already have been stopped.
      }
    });
  }

  honk() {
    this.hornStart();
    setTimeout(() => this.hornStop(), 460);
  }

  whoosh(takeoff = true) {
    if (!this.context || this.muted) return;
    const ctx = this.context;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(takeoff ? 260 : 2500, now);
    filter.frequency.exponentialRampToValueAtTime(takeoff ? 2800 : 300, now + 1.2);
    filter.frequency.exponentialRampToValueAtTime(takeoff ? 500 : 180, now + 1.9);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);

    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 2.0);

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(takeoff ? 132 : 220, now);
    tone.frequency.exponentialRampToValueAtTime(takeoff ? 440 : 68, now + 1.25);
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.06, now + 0.08);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    tone.connect(toneGain).connect(this.master);
    tone.start(now);
    tone.stop(now + 1.55);
  }

  jetBurst() {
    if (!this.context || this.muted) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1600;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.5);
  }

  thud(strength = 1) {
    if (!this.context || this.muted) return;
    const ctx = this.context;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(32, now + 0.34);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * strength, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.42);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.12 * strength, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.24);
  }

  click() {
    if (!this.context || this.muted) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
  }

  clickLight() {
    if (!this.context || this.muted) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1200, now);
    oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.035);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.022, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }
}
