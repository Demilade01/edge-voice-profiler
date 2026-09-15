'use client';

import { LatencyEvent } from '@/types';

interface LatencyDashboardProps {
  events: LatencyEvent[];
  isRecording: boolean;
}

interface LatencyMetrics {
  permission: number;
  connection: number;
  transcription: number;
  ttfb: number;
  response: number;
}

export default function LatencyDashboard({ events, isRecording }: LatencyDashboardProps) {
  const metrics = getMetrics(events);
  const maxLatency = Math.max(...Object.values(metrics), 100);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Aethex Latency Waterfall</h2>
        {isRecording && <div className="pill"><span>🎙️ Live</span></div>}
      </div>

      <div className="latency-metrics-grid mb-8">
        <Metric label="Mic permission" value={metrics.permission} />
        <Metric label="WebRTC connect" value={metrics.connection} />
        <Metric label="Transcription" value={metrics.transcription} />
        <Metric label="Audio TTFB" value={metrics.ttfb} />
        <Metric label="Response" value={metrics.response} />
      </div>

      <div className="space-y-2">
        <WaterfallItem label="Mic permission" value={metrics.permission} max={maxLatency} />
        <WaterfallItem label="WebRTC connect" value={metrics.connection} max={maxLatency} />
        <WaterfallItem label="Finalized transcription" value={metrics.transcription} max={maxLatency} />
        <WaterfallItem label="First remote audio (TTFB)" value={metrics.ttfb} max={maxLatency} />
        <WaterfallItem label="Response completion" value={metrics.response} max={maxLatency} />
      </div>

      {events.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">Event log</h3>
            <span className="event-count">{events.length} captured</span>
          </div>
          <div className="event-feed">
            {events.slice(-12).reverse().map((event, index) => (
              <div
                key={`${event.timestamp}-${event.eventType}-${index}`}
                className="event-row"
              >
                <span className="font-medium">{formatEventName(event.eventType)}</span>
                <span className="text-gray-600">
                  {formatLatency(event.elapsedMs)}{event.metadata?.response_ms !== undefined
                    ? ` · response ${formatLatency(Number(event.metadata.response_ms))}`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): React.ReactNode {
  return (
    <div className="metric-card">
      <div className="metric-value" title={`${value.toFixed(0)}ms`}>{formatLatency(value)}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function WaterfallItem({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="waterfall-item">
      <div className="waterfall-label">{label}</div>
      <div className="waterfall-bar-container amber">
        <div className="waterfall-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
      <div className="waterfall-time" title={`${value.toFixed(0)}ms`}>{formatLatency(value)}</div>
    </div>
  );
}

function getMetrics(events: LatencyEvent[]): LatencyMetrics {
  const first = (eventType: string) => events.find((event) => event.eventType === eventType);
  const delta = (from?: LatencyEvent, to?: LatencyEvent) => {
    if (from?.elapsedMs === undefined || to?.elapsedMs === undefined) return 0;
    return Math.max(0, to.elapsedMs - from.elapsedMs);
  };
  const session = first('session_start');

  return {
    permission: delta(session, first('microphone_permission_granted')),
    connection: delta(session, first('webrtc_connected')),
    transcription: delta(first('user_speech_end'), first('finalized_transcription')),
    ttfb: delta(first('user_speech_end'), first('first_remote_audio_activity')),
    response: delta(first('first_remote_audio_activity'), first('response_completed')),
  };
}

function formatEventName(eventType: string): string {
  return eventType.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLatency(milliseconds?: number): string {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) return 'pending';
  if (milliseconds < 1000) return `${milliseconds.toFixed(0)}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${(milliseconds / 60000).toFixed(1)}m`;
}
