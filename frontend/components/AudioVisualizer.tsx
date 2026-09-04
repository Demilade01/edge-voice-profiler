'use client';

interface AudioVisualizerProps {
  volume: number;
  isActive: boolean;
}

export default function AudioVisualizer({ volume, isActive }: AudioVisualizerProps) {
  const barCount = 20;
  const bars = Array.from({ length: barCount }, (_, i) => i);

  // Generate heights based on volume with some randomness for visual effect
  const getBarHeight = (index: number) => {
    if (!isActive) return 4;

    // Create a wave pattern centered around the middle
    const center = barCount / 2;
    const distance = Math.abs(index - center);
    const baseHeight = Math.max(4, volume * 0.6);
    const wave = baseHeight * (1 - distance / center);

    const variation = 0.8 + ((index * 7) % 5) * 0.1;
    return Math.max(4, wave * variation);
  };

  return (
    <div className="audio-visualizer">
      {bars.map((index) => (
        <div
          key={index}
          className="audio-bar"
          style={{
            height: `${getBarHeight(index)}px`,
            opacity: isActive ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
