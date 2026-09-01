export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private onAudioDataCallback: ((data: Float32Array) => void) | null = null;
  private onVolumeCallback: ((volume: number) => void) | null = null;

  async initialize(
    onAudioData: (data: Float32Array) => void,
    onVolume?: (volume: number) => void
  ): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create script processor for audio capture
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.onAudioDataCallback = onAudioData;
      this.onVolumeCallback = onVolume || null;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume (RMS)
        if (this.onVolumeCallback) {
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          const volume = Math.max(0, Math.min(100, rms * 100 * 5));
          this.onVolumeCallback(volume);
        }

        // Send audio data
        if (this.onAudioDataCallback) {
          this.onAudioDataCallback(inputData);
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      console.log('🎤 Microphone initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize microphone:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('🛑 Microphone stopped');
  }

  isActive(): boolean {
    return this.audioContext !== null && this.mediaStream !== null;
  }
}

export function float32ToPCM16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
