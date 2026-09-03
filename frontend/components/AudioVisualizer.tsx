'use client';

import { useEffect, useRef } from 'react';

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
    
    // Add some randomness
    const randomFactor = 0.7 + Math.random() * 0.6;
    return Math.max(4, wave * randomFactor);
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
