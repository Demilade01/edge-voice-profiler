/**
 * PCM Player AudioWorklet Processor
 *
 * Runs on the browser's dedicated audio rendering thread (NOT the JS main thread).
 * Maintains a ring buffer that the main thread fills with PCM samples via postMessage.
 * Every ~8ms (128 samples at 16kHz), the browser calls process() and we pull samples
 * from the ring buffer into the output. If the buffer is empty, we output silence.
 *
 * For barge-in: the main thread posts { type: 'clear' } and we instantly zero the buffer.
 *
 * This is the same architecture used by Vapi, Retell, LiveKit, and Deepgram's AgentPlayer.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer — 30 seconds of 16kHz mono audio
    this.bufferSize = 16000 * 30;
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.available = 0;
    this.responseId = null;
    this.responseEnded = false;
    this.hasQueuedAudio = false;
    this.renderedSamples = 0;
    this.wasUnderrunning = false;

    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        // Main thread is feeding us Float32 PCM samples
        const samples = event.data.samples;
        this.responseId = event.data.responseId;
        for (let i = 0; i < samples.length; i++) {
          this.buffer[this.writePos] = samples[i];
          this.writePos = (this.writePos + 1) % this.bufferSize;
        }
        this.available += samples.length;
        // Overflow protection — if writer overtakes reader, snap reader forward
        if (this.available > this.bufferSize) {
          this.available = this.bufferSize;
          this.readPos = this.writePos;
        }
        this.hasQueuedAudio = true;
        this.port.postMessage({
          type: 'queued',
          responseId: this.responseId,
          samples: samples.length,
          available: this.available,
        });
      } else if (event.data.type === 'response-end') {
        if (event.data.responseId === this.responseId) {
          this.responseEnded = true;
          this.notifyIfDrained();
        }
      } else if (event.data.type === 'clear') {
        // Barge-in: instantly silence by resetting the ring buffer
        this.writePos = 0;
        this.readPos = 0;
        this.available = 0;
        this.responseId = null;
        this.responseEnded = false;
        this.hasQueuedAudio = false;
        this.wasUnderrunning = false;
        this.port.postMessage({ type: 'cleared' });
      }
    };
  }

  notifyIfDrained() {
    if (this.responseEnded && this.responseId !== null && this.available === 0) {
      this.port.postMessage({ type: 'drained', responseId: this.responseId });
      this.hasQueuedAudio = false;
      this.responseEnded = false;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0]; // mono, 128 samples per render quantum

    const toRead = Math.min(output.length, this.available);

    // Pull samples from the ring buffer
    for (let i = 0; i < toRead; i++) {
      output[i] = this.buffer[this.readPos];
      this.readPos = (this.readPos + 1) % this.bufferSize;
    }

    // Fill any remaining frames with silence (buffer underrun)
    for (let i = toRead; i < output.length; i++) {
      output[i] = 0;
    }

    this.available -= toRead;
    this.renderedSamples += toRead;
    const isUnderrunning = toRead < output.length;
    if (isUnderrunning && !this.wasUnderrunning) {
      this.port.postMessage({
        type: 'underrun',
        responseId: this.responseId,
        available: this.available,
        renderedSamples: this.renderedSamples,
      });
    }
    this.wasUnderrunning = isUnderrunning;
    this.notifyIfDrained();

    // Return true to keep the processor alive indefinitely
    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);
