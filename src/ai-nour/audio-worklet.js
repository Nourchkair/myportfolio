/*
 * Nupa microphone resampler.
 *
 * Runs on the audio thread. Applies a windowed-sinc low-pass filter before
 * fractional resampling to 16 kHz, so microphone content above 8 kHz does not
 * fold back into the speech band. Output is posted in 20 ms Int16 blocks.
 */

const TAPS = 127;
const OUTPUT_BLOCK = 320; // 20 ms at 16 kHz

function designLowpass(taps, sampleRate) {
  const cutoff = Math.min(7200, sampleRate * 0.45);
  const fc = cutoff / sampleRate;
  const centre = (taps - 1) / 2;
  const filter = new Float32Array(taps);
  let sum = 0;
  for (let index = 0; index < taps; index++) {
    const n = index - centre;
    const ideal = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    const window = 0.42
      - 0.5 * Math.cos((2 * Math.PI * index) / (taps - 1))
      + 0.08 * Math.cos((4 * Math.PI * index) / (taps - 1));
    filter[index] = ideal * window;
    sum += filter[index];
  }
  if (sum !== 0) {
    for (let index = 0; index < taps; index++) filter[index] /= sum;
  }
  return filter;
}

class NupaMicResampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options?.processorOptions || {};
    this.inputRate = sampleRate;
    this.targetRate = Number(settings.targetRate) || 16000;
    this.ratio = this.inputRate / this.targetRate;
    this.taps = TAPS;
    this.filter = designLowpass(this.taps, this.inputRate);
    this.tail = new Float32Array(this.taps - 1);
    this.blockStart = 0;
    this.readPos = 0;
    this.out = new Int16Array(OUTPUT_BLOCK);
    this.outIndex = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'reset') this.reset();
      if (event.data?.type === 'flush') this.flush();
    };
  }

  reset() {
    this.tail.fill(0);
    this.blockStart = 0;
    this.readPos = 0;
    this.out = new Int16Array(OUTPUT_BLOCK);
    this.outIndex = 0;
  }

  convolve(work, start) {
    let value = 0;
    for (let index = 0; index < this.taps; index++) {
      value += work[start + index] * this.filter[index];
    }
    return value;
  }

  push(sample) {
    const clipped = Math.max(-1, Math.min(1, sample));
    this.out[this.outIndex++] = Math.round(clipped * 0x7fff);
    if (this.outIndex >= this.out.length) this.flush();
  }

  flush() {
    if (!this.outIndex) return;
    const block = this.outIndex === this.out.length ? this.out : this.out.slice(0, this.outIndex);
    this.port.postMessage({ type: 'samples', buffer: block.buffer }, [block.buffer]);
    this.out = new Int16Array(OUTPUT_BLOCK);
    this.outIndex = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || !input.length) return true;
    const tailLength = this.taps - 1;
    const work = new Float32Array(tailLength + input.length);
    work.set(this.tail, 0);
    work.set(input, tailLength);
    const workStart = this.blockStart - tailLength;
    const blockEnd = this.blockStart + input.length;

    while (this.readPos + this.taps + 1 <= blockEnd) {
      const local = this.readPos - workStart;
      const base = Math.floor(local);
      const fraction = local - base;
      const first = this.convolve(work, base);
      const second = this.convolve(work, base + 1);
      this.push(first + (second - first) * fraction);
      this.readPos += this.ratio;
    }

    this.tail = work.slice(work.length - tailLength);
    this.blockStart = blockEnd;
    return true;
  }
}

registerProcessor('nupa-mic-resampler', NupaMicResampler);
