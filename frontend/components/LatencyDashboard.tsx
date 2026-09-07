'use client';

import { LatencyEvent, LatencySummary } from '@/types';

interface LatencyDashboardProps {
  events: LatencyEvent[];
  summary: LatencySummary | null;
  isRecording: boolean;
}

interface LatencyMetrics {
  transport: number;
  stt: number;
  llm: number;
  tts: number;
  total: number;
}

export default function LatencyDashboard({ events, summary, isRecording }: LatencyDashboardProps) {
  const metrics = getMetrics(events, summary);

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
      <div className="latency-metrics-grid mb-8">
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">Recent Events</h3>
            <span className="event-count">{events.length} captured</span>
          </div>
          <div className="event-feed">
            {getDisplayEvents(events).map((event) => (
              <div
                key={event.key}
                className={`event-row ${event.kind === 'transport' ? 'event-row-muted' : ''}`}
              >
                <span className="font-medium">{event.label}</span>
                <span className="text-gray-600">{event.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DisplayEvent {
  key: string;
  label: string;
  value: string;
  kind: 'milestone' | 'transport';
}

function getDisplayEvents(events: LatencyEvent[]): DisplayEvent[] {
  const transportEvents = events.filter((event) => event.eventType === 'server_audio_received');
  const milestones: DisplayEvent[] = events
    .filter((event) => event.eventType !== 'server_audio_received' && event.eventType !== 'deepgram_stt_request_sent')
    .slice(-8)
    .reverse()
    .map((event, index) => ({
      key: `${event.timestamp}-${event.eventType}-${index}`,
      label: formatEventName(event.eventType),
      value: formatDuration(event.durationMs),
      kind: 'milestone' as const,
    }));

  if (transportEvents.length > 0) {
    milestones.push({
      key: 'transport-summary',
      label: 'Audio transport',
      value: `${transportEvents.length} frames`,
      kind: 'transport',
    });
  }

  return milestones;
}

function formatEventName(eventType: string): string {
  return eventType
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(durationMs?: number): string {
  return typeof durationMs === 'number' ? `${durationMs.toFixed(0)}ms` : 'pending';
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
      <div className={`waterfall-bar-container ${color}`}>
        <div
          className="waterfall-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="waterfall-time">{value.toFixed(0)}ms</div>
    </div>
  );
}

function getMetrics(events: LatencyEvent[], summary: LatencySummary | null): LatencyMetrics {
  if (summary) {
    return {
      transport: summary.clientToServerMs || 0,
      stt: summary.sttMs || 0,
      llm: summary.llmMs || 0,
      tts: summary.ttsTimeToFirstByteMs || 0,
      total: summary.totalTurnMs || 0,
    };
  }

  const latest = new Map<string, number>();
  for (const event of events) {
    if (typeof event.durationMs === 'number') {
      latest.set(event.eventType, event.durationMs);
    }
  }

  const transport = latest.get('server_audio_received') || 0;
  const stt = latest.get('deepgram_stt_response_received') || 0;
  const llm = latest.get('llm_response_received') || 0;
  const tts = latest.get('deepgram_tts_first_byte') || 0;

  return {
    transport,
    stt,
    llm,
    tts,
    total: transport + stt + llm + tts,
  };
}
