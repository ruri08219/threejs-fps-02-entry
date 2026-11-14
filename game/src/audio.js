// All sound is synthesised with WebAudio: no audio files, no network, nothing to
// load. A tiny helper builds short envelopes of noise or tone, and each game event
// gets its own small voice. Audio starts only after the player clicks in, because
// browsers refuse sound before a gesture.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || !context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol, lowFreq, highFreq) {
    if (!ensure() || !context) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = lowFreq;
    filter.Q.value = 0.8;
    if (highFreq) filter.frequency.exponentialRampToValueAtTime(highFreq, now + dur);
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  return {
    unlock() { ensure(); if (context && context.state === 'suspended') void context.resume(); },
    shot(kind) {
      if (kind === 'rifle') noise(0.12, 0.9, 900, 220);
      else if (kind === 'smg') noise(0.08, 0.7, 1300, 300);
      else if (kind === 'pistol') noise(0.1, 0.8, 700, 180);
      else if (kind === 'shotgun') noise(0.22, 1.0, 500, 120);
      else noise(0.1, 0.7, 900, 200);
    },
    dryClick() { tone(1800, 0.04, 'square', 0.12); },
    reload() { tone(420, 0.06, 'square', 0.14); tone(640, 0.05, 'square', 0.12); },
    hit() { tone(1200, 0.05, 'sine', 0.25); },
    kill() { tone(880, 0.07, 'sine', 0.3); tone(1320, 0.09, 'sine', 0.25); },
    hurt() { noise(0.15, 0.5, 300, 90); },
    explosion() { noise(0.7, 1.0, 220, 40); tone(70, 0.5, 'sine', 0.5, 30); },
    plantBeep() { tone(1040, 0.09, 'square', 0.2); },
    defuseBeep() { tone(1560, 0.07, 'square', 0.18); },
    roundStart() { tone(523, 0.12, 'triangle', 0.25); tone(784, 0.18, 'triangle', 0.25); },
    roundWin() { tone(523, 0.14, 'triangle', 0.28); tone(659, 0.14, 'triangle', 0.28); tone(784, 0.26, 'triangle', 0.3); },
    roundLose() { tone(392, 0.16, 'triangle', 0.26); tone(311, 0.16, 'triangle', 0.26); tone(233, 0.3, 'triangle', 0.28); },
    buy() { tone(990, 0.06, 'sine', 0.2); },
    denied() { tone(180, 0.12, 'square', 0.2); },
    step() { noise(0.05, 0.1, 400, 200); },
  };
}
