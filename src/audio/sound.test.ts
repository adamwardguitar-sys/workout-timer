import { createSound } from './sound';

class FakeParam {
  value = 1;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeOsc {
  type = 'sine';
  frequency = new FakeParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}
class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators: FakeOsc[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createOscillator() {
    const o = new FakeOsc();
    this.oscillators.push(o);
    return o;
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
}

function setup() {
  const ctx = new FakeCtx();
  const sound = createSound({ ctxFactory: () => ctx as unknown as AudioContext });
  return { ctx, sound };
}

afterEach(() => {
  delete (navigator as { vibrate?: unknown }).vibrate;
});

describe('createSound', () => {
  it('unlock resumes the audio context', async () => {
    const { ctx, sound } = setup();
    await sound.unlock();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('play beep creates and starts one oscillator', async () => {
    const { ctx, sound } = setup();
    await sound.unlock();
    sound.play('beep');
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.oscillators[0].start).toHaveBeenCalled();
  });

  it('finish plays more notes than a beep', async () => {
    const { ctx, sound } = setup();
    await sound.unlock();
    sound.play('finish');
    expect(ctx.oscillators.length).toBeGreaterThan(1);
  });

  it('play is a no-op before unlock', () => {
    const { ctx, sound } = setup();
    sound.play('beep');
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('play is a no-op when sound is disabled', async () => {
    const { ctx, sound } = setup();
    await sound.unlock();
    sound.setEnabled(false);
    sound.play('beep');
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('setVolume sets the master gain, including when set before unlock', async () => {
    const a = setup();
    await a.sound.unlock();
    a.sound.setVolume(0.5);
    expect(a.ctx.gains[0].gain.value).toBe(0.5);

    const b = setup();
    b.sound.setVolume(0.3);
    await b.sound.unlock();
    expect(b.ctx.gains[0].gain.value).toBe(0.3);
  });

  it('vibrates on work when vibrate is on and supported', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { sound } = setup();
    await sound.unlock();
    sound.play('work');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not vibrate when vibrate is off', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { sound } = setup();
    await sound.unlock();
    sound.setVibrate(false);
    sound.play('work');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does not throw when navigator.vibrate is missing', async () => {
    const { sound } = setup();
    await sound.unlock();
    expect(() => sound.play('rest')).not.toThrow();
  });
});
