import { VoiceActivityDetector } from './vad';

export interface LocalVadMonitorOptions {
  onVolume: (volume: number) => void;
  detector: VoiceActivityDetector;
}

/**
 * Observes the SDK-owned microphone stream locally for VAD only.
 *
 * It never encodes, sends, or plays microphone samples. Aethex remains the
 * sole owner of microphone transport; this analyser only feeds a local RMS
 * level into the existing speech detector.
 */
export class LocalVadMonitor {
  private readonly context: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly samples: Uint8Array<ArrayBuffer>;
  private readonly options: LocalVadMonitorOptions;
  private animationFrame: number | null = null;
  private stopped = false;

  constructor(stream: MediaStream, options: LocalVadMonitorOptions) {
    const AudioContextConstructor = window.AudioContext || (
      window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('Web Audio API is not supported in this browser');
    }

    this.options = options;
    this.context = new AudioContextConstructor();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.35;
    this.samples = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    void this.context.resume();
    this.tick();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.source.disconnect();
    this.analyser.disconnect();
    void this.context.close();
  }

  private tick = (): void => {
    if (this.stopped) return;

    this.analyser.getByteTimeDomainData(this.samples);
    let sumSquares = 0;
    for (const sample of this.samples) {
      const normalized = (sample - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / this.samples.length);
    const volume = Math.min(100, rms * 220);
    this.options.onVolume(volume);
    this.options.detector.processVolume(volume);
    this.animationFrame = requestAnimationFrame(this.tick);
  };
}
