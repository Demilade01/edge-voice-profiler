'use client';

import { LatencyEvent } from '@/types';
import { useEffect, useState } from 'react';

interface LatencyDashboardProps {
  events: LatencyEvent[];
  isRecording: boolean;
}

interface LatencyMetrics {
  transport: number;
  stt: number;
  llm: number;
  tts: number;
  total: number;
}

export default function LatencyDashboard({ events, isRecording }: LatencyDashboardProps) {
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    transport: 0,
    stt: 0,
    llm: 0,
    tts: 0,
    total: 0,
  });

  useEffect(() => {
    if (events.length === 0) return;

    // Calculate latency for each hop
    const latencyMap: Record<string, number> = {};
    
    events.forEach((event) => {
      if (event.durationMs) {
        latencyMap[event.eventType] = event.durationMs;
      }
    });

    setMetrics({
      transport: latencyMap['audio_received'] || 0,
      stt: latencyMap['stt_complete'] || 0,
      llm: latencyMap['llm_complete'] || 0,
      tts: latencyMap['tts_first_byte'] || 0,
      total: Object.values(latencyMap).reduce((sum, val) => sum + val, 0),
    });
  }, [events]);

  const maxLatency = Math.max(
    metrics.transport,
    metrics.stt,
    metrics.llm,
    metrics.tts,
    100
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Latency Waterfall</h2>
        {isRecording && (
          <div className="pill">
            <span>🎙️ Recording</span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="metric-card">
          <div className="metric-value">{metrics.transport.toFixed(0)}ms</div>
          <div className="metric-label">Transport</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.stt.toFixed(0)}ms</div>
          <div className="metric-label">STT (Deepgram)</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.llm.toFixed(0)}ms</div>
          <div className="metric-label">LLM (Groq)</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.tts.toFixed(0)}ms</div>
          <div className="metric-label">TTS (Aura)</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.total.toFixed(0)}ms</div>
          <div className="metric-label">Total Turn</div>
        </div>
      </div>

      {/* Waterfall Visualization */}
      <div className="space-y-2">
        <WaterfallItem
          label="Transport"
          value={metrics.transport}
          max={maxLatency}
          color="amber"
        />
        <WaterfallItem
          label="STT"
          value={metrics.stt}
          max={maxLatency}
          color="amber"
        />
        <WaterfallItem
          label="LLM"
          value={metrics.llm}
          max={maxLatency}
          color="amber"
        />
        <WaterfallItem
          label="TTS TTFB"
          value={metrics.tts}
          max={maxLatency}
          color="amber"
        />
      </div>

      {/* Recent Events Log */}
      {events.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3">Recent Events</h3>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {events.slice(-10).reverse().map((event, idx) => (
              <div
                key={idx}
                className="text-sm py-1 px-2 bg-gray-50 rounded flex justify-between"
              >
                <span className="font-medium">{event.eventType}</span>
                <span className="text-gray-600">
                  {event.durationMs ? `${event.durationMs.toFixed(0)}ms` : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface WaterfallItemProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function WaterfallItem({ label, value, max, color }: WaterfallItemProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="waterfall-item">
      <div className="waterfall-label">{label}</div>
      <div className="waterfall-bar-container">
        <div
          className="waterfall-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="waterfall-time">{value.toFixed(0)}ms</div>
    </div>
  );
}
