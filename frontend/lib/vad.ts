export class VoiceActivityDetector {
  private volumeThreshold: number = 7; // Percentage
  private noiseFloor: number = 2;
  private readonly noiseFloorSmoothing = 0.08;
  private readonly speechToNoiseRatio = 2;
  private readonly calibrationFrames = 8;
  private readonly requiredSpeechFrames = 2;
  private processedFrames = 0;
  private speechCandidateFrames = 0;
  private silenceDuration: number = 1500; // ms
  private lastSpeechTime: number = 0;
  private isSpeaking: boolean = false;
  private onSpeechStart: (() => void) | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private onBargeIn: (() => void) | null = null;
  private isAgentSpeaking: boolean = false;
  private hasBargedIn: boolean = false;

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
    if (!speaking) {
      this.hasBargedIn = false;
    }
  }

  processVolume(volume: number): void {
    const now = Date.now();
    this.processedFrames += 1;

    if (this.processedFrames <= this.calibrationFrames) {
      this.noiseFloor += (volume - this.noiseFloor) * this.noiseFloorSmoothing;
      return;
    }

    const dynamicThreshold = Math.max(
      this.volumeThreshold,
      this.noiseFloor * this.speechToNoiseRatio
    );

    if (volume > dynamicThreshold) {
      this.speechCandidateFrames += 1;

      if (this.speechCandidateFrames < this.requiredSpeechFrames) {
        return;
      }

      this.lastSpeechTime = now;

      if (this.isAgentSpeaking && !this.hasBargedIn && this.onBargeIn) {
        this.hasBargedIn = true;
        console.log('🛑 Barge-in detected!');
        this.onBargeIn();
      }

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        console.log('🗣️ Speech started');

        if (this.onSpeechStart) {
          this.onSpeechStart();
        }
      }
    } else {
      this.speechCandidateFrames = 0;
      this.noiseFloor += (volume - this.noiseFloor) * this.noiseFloorSmoothing;

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
    this.hasBargedIn = false;
    this.processedFrames = 0;
    this.speechCandidateFrames = 0;
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
