export class VoiceActivityDetector {
  private volumeThreshold: number = 15; // Percentage
  private silenceDuration: number = 1500; // ms
  private lastSpeechTime: number = 0;
  private isSpeaking: boolean = false;
  private onSpeechStart: (() => void) | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private onBargeIn: (() => void) | null = null;
  private isAgentSpeaking: boolean = false;

  constructor(
    onSpeechStart?: () => void,
    onSpeechEnd?: () => void,
    onBargeIn?: () => void
  ) {
    this.onSpeechStart = onSpeechStart || null;
    this.onSpeechEnd = onSpeechEnd || null;
    this.onBargeIn = onBargeIn || null;
  }

  setAgentSpeaking(speaking: boolean): void {
    this.isAgentSpeaking = speaking;
  }

  processVolume(volume: number): void {
    const now = Date.now();

    if (volume > this.volumeThreshold) {
      // Voice activity detected
      this.lastSpeechTime = now;

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        console.log('🗣️ Speech started');
        
        // Check for barge-in
        if (this.isAgentSpeaking && this.onBargeIn) {
          console.log('🛑 Barge-in detected!');
          this.onBargeIn();
        }
        
        if (this.onSpeechStart) {
          this.onSpeechStart();
        }
      }
    } else {
      // Check for silence
      if (this.isSpeaking && now - this.lastSpeechTime > this.silenceDuration) {
        this.isSpeaking = false;
        console.log('🤐 Speech ended (silence detected)');
        if (this.onSpeechEnd) {
          this.onSpeechEnd();
        }
      }
    }
  }

  reset(): void {
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
  }

  getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  setVolumeThreshold(threshold: number): void {
    this.volumeThreshold = threshold;
  }

  setSilenceDuration(duration: number): void {
    this.silenceDuration = duration;
  }
}
