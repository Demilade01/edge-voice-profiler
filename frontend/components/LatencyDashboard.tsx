'use client';

import { useMemo, useState } from 'react';
import { LatencyEvent } from '@/types';

interface LatencyDashboardProps {
  events: LatencyEvent[];
  isRecording: boolean;
}

interface LatencyMetrics {
  connection: number;
  transcription: number;
  ttfb: number;
  response: number;
  bargeIn: number;
}

export default function LatencyDashboard({ events, isRecording }: LatencyDashboardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const metrics = useMemo(() => getMetrics(events), [events]);

  return (
    <div className="profiler-panel glass-panel">
      <div className="panel-heading profiler-heading">
        <div>
          <div className="section-kicker">DIAGNOSTIC WATERFALL</div>
          <h2>Latency at every hop</h2>
        </div>
        <div className={`profiler-live ${isRecording ? 'is-active' : ''}`}>
          <span />
          {isRecording ? 'CAPTURING' : 'STANDBY'}
        </div>
      </div>

      <div className="metric-strip">
        <Metric label="WebRTC connect" value={metrics.connection} accent="cyan" />
        <Metric label="Transcription" value={metrics.transcription} accent="violet" />
        <Metric label="Audio TTFB" value={metrics.ttfb} accent="green" />
        <Metric label="Response" value={metrics.response} accent="cyan" />
        <Metric label="Barge-in" value={metrics.bargeIn} accent="orange" />
      </div>

      <button
        className="diagnostics-toggle"
        onClick={() => setDetailsOpen((current) => !current)}
        aria-expanded={detailsOpen}
      >
        <span>
          <span className="toggle-icon">{detailsOpen ? '−' : '+'}</span>
          {detailsOpen ? 'Hide event stream' : 'Open full event stream'}
        </span>
        <span className="diagnostics-count">{events.length} events</span>
      </button>

      {detailsOpen && (
        <div className="diagnostics-body">
          <div className="waterfall-list">
            <WaterfallItem label="WebRTC connection" value={metrics.connection} max={maxMetric(metrics)} accent="cyan" />
            <WaterfallItem label="Finalized transcription" value={metrics.transcription} max={maxMetric(metrics)} accent="violet" />
            <WaterfallItem label="First remote audio / TTFB" value={metrics.ttfb} max={maxMetric(metrics)} accent="green" />
            <WaterfallItem label="Response completion" value={metrics.response} max={maxMetric(metrics)} accent="cyan" />
            <WaterfallItem label="Barge-in response" value={metrics.bargeIn} max={maxMetric(metrics)} accent="orange" />
          </div>

          <div className="event-stream">
            {events.length === 0 ? (
              <div className="event-empty">Start a session to capture browser timing events.</div>
            ) : (
              events.slice(-20).reverse().map((event, index) => (
                <EventRow
                  key={`${event.timestamp}-${event.eventType}-${index}`}
                  event={event}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`profiler-metric metric-accent-${accent}`}>
      <span className="profiler-metric-value">{formatLatency(value)}</span>
      <span className="profiler-metric-label">{label}</span>
    </div>
  );
}

function WaterfallItem({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: string;
}) {
  const percentage = max > 0 && value > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="waterfall-row">
      <span className="waterfall-row-label">{label}</span>
      <div className={`waterfall-track track-${accent}`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
      <strong>{formatLatency(value)}</strong>
    </div>
  );
}

function EventRow({ event }: { event: LatencyEvent }) {
  const severity = event.eventType.includes('barge')
    ? 'warning'
    : event.eventType.includes('error')
      ? 'error'
      : 'normal';
  return (
    <div className={`event-stream-row event-${severity}`}>
      <span className="event-severity-dot" />
      <span className="event-name">{formatEventName(event.eventType)}</span>
      <span className="event-time">{formatLatency(event.elapsedMs)}</span>
      {typeof event.metadata?.source === 'string' && (
        <span className="event-source">{String(event.metadata.source)}</span>
      )}
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
  const speechEnd = first('user_speech_end');
  const firstAudio = first('first_remote_audio_activity');

  const bargeInEvent = events.find((event) => event.eventType === 'barge_in_triggered');
  const bargeIn = bargeInEvent?.metadata?.response_ms;

  return {
    connection: delta(session, first('webrtc_connected')),
    transcription: delta(speechEnd, first('finalized_transcription')),
    ttfb: delta(speechEnd, firstAudio),
    response: delta(firstAudio, first('response_completed')),
    bargeIn: typeof bargeIn === 'number' ? bargeIn : 0,
  };
}

function maxMetric(metrics: LatencyMetrics): number {
  return Math.max(...Object.values(metrics), 100);
}

function formatEventName(eventType: string): string {
  return eventType.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLatency(milliseconds?: number): string {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '—';
  }
  if (milliseconds < 1000) return `${milliseconds.toFixed(0)}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${(milliseconds / 60000).toFixed(1)}m`;
}
