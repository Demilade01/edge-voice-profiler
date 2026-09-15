'use client';

export type VisualizerPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'agent-speaking'
  | 'barge-in'
  | 'error';

interface AudioVisualizerProps {
  volume: number;
  isActive: boolean;
  phase: VisualizerPhase;
}

export default function AudioVisualizer({ volume, isActive, phase }: AudioVisualizerProps) {
  const bars = Array.from({ length: 28 }, (_, index) => index);
  const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;

  return (
    <div className={`audio-visualizer phase-${phase}`} aria-label={`${phase} audio visualization`}>
      <div className="visualizer-bars" aria-hidden="true">
        {bars.map((index) => {
          const distance = Math.abs(index - bars.length / 2);
          const shape = Math.max(0.18, 1 - distance / (bars.length / 2));
          const pulse = isActive ? 0.8 + ((index * 17) % 7) / 10 : 0.45;
          const height = isActive
            ? Math.max(8, (14 + normalizedVolume * 52) * shape * pulse)
            : 8 + (index % 3) * 2;

          return (
            <span
              key={index}
              className="audio-bar"
              style={{ height: `${height}px`, animationDelay: `${index * -0.045}s` }}
            />
          );
        })}
      </div>
      <div className="visualizer-core" aria-hidden="true">
        <span className="core-ring core-ring-one" />
        <span className="core-ring core-ring-two" />
        <span className="core-dot" />
      </div>
    </div>
  );
}
