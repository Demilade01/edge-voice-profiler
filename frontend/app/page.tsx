'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTranscript,
  PipelineMetrics,
  WebRTCPlatform,
  useAethexCall,
  webPlatform,
} from '@aethexai/react';
import AudioVisualizer, { VisualizerPhase } from '@/components/AudioVisualizer';
import LatencyDashboard from '@/components/LatencyDashboard';
import { LocalVadMonitor } from '@/lib/local-vad-monitor';
import { VoiceActivityDetector } from '@/lib/vad';
import { LatencyEvent } from '@/types';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const agentId = process.env.NEXT_PUBLIC_AETHEX_AGENT_ID || '';

interface TurnState {
  turnId: string;
  startedAt: number;
  speechEndAt?: number;
  responseStartAt?: number;
  firstAudioAt?: number;
  finalizedTranscriptAt?: number;
}

type SessionPhase = VisualizerPhase;

export default function Home() {
  const [events, setEvents] = useState<LatencyEvent[]>([]);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [localVolume, setLocalVolume] = useState(0);
  const [isLocallySpeaking, setIsLocallySpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bargeInVisible, setBargeInVisible] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);

  const sessionStartedAt = useRef<number | null>(null);
  const turn = useRef<TurnState | null>(null);
  const previousAgentSpeaking = useRef(false);
  const interruptRef = useRef<() => void>(() => undefined);
  const monitorRef = useRef<LocalVadMonitor | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const bargeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logEvent = useCallback((
    eventType: string,
    metadata?: Record<string, unknown>,
    eventTime = performance.now()
  ) => {
    const sessionTime = sessionStartedAt.current;
    const turnStart = turn.current?.startedAt;
    const event: LatencyEvent = {
      eventType,
      timestamp: new Date().toISOString(),
      elapsedMs: sessionTime === null ? undefined : eventTime - sessionTime,
      durationMs: turnStart === undefined ? undefined : eventTime - turnStart,
      metadata,
    };

    console.info(`[aethex-profiler] ${eventType}`, {
      elapsedMs: event.elapsedMs,
      durationMs: event.durationMs,
      ...metadata,
    });
    setEvents((current) => [...current, event]);
  }, []);

  const showBargeIn = useCallback(() => {
    setBargeInVisible(true);
    if (bargeInTimerRef.current) clearTimeout(bargeInTimerRef.current);
    bargeInTimerRef.current = setTimeout(() => setBargeInVisible(false), 1600);
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const tokenResponse = await fetch(`${backendUrl}/api/aethex-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await tokenResponse.json() as {
      token?: string;
      error?: string;
      detail?: string;
    };

    if (!tokenResponse.ok || !body.token) {
      throw new Error(body.detail || body.error || `Token request failed (${tokenResponse.status})`);
    }
    return body.token;
  }, []);

  const [detector] = useState(() => new VoiceActivityDetector());

  const platform = useMemo<WebRTCPlatform>(() => ({
    ...webPlatform,
    getUserMedia: async (constraints) => {
      const stream = await webPlatform.getUserMedia(constraints);
      localStreamRef.current = stream;
      logEvent('microphone_permission_granted', {
        audio_tracks: stream.getAudioTracks().length,
      });

      monitorRef.current?.stop();
      monitorRef.current = new LocalVadMonitor(stream, {
        detector,
        onVolume: setLocalVolume,
      });
      return stream;
    },
  }), [detector, logEvent]);

  const handleMetrics = useCallback((metrics: PipelineMetrics) => {
    console.info('[aethex-profiler] pipeline-metrics', metrics);
    const record = metrics as Record<string, unknown>;
    const text = firstString(record, [
      'finalized_transcript',
      'transcript',
      'user_transcript',
      'assistant_text',
      'response_text',
    ]);

    if (!text) return;
    if (record.assistant_text || record.response_text) {
      setResponse(text);
    } else {
      setTranscript(text);
    }

    if (!turn.current?.finalizedTranscriptAt && record.finalized_transcript) {
      const now = performance.now();
      turn.current!.finalizedTranscriptAt = now;
      logEvent('finalized_transcription', { text }, now);
    }
  }, [logEvent]);

  const {
    isConnecting,
    isConnected,
    isMuted,
    isSpeaking: agentSpeaking,
    volume: agentVolume,
    remoteStream,
    sessionId,
    error: callError,
    start,
    stop,
    interrupt,
    setMuted,
    setOutputVolume,
  } = useAethexCall({
    agentId,
    getToken,
    platform,
    onConnected: () => logEvent('webrtc_connected'),
    onEnded: async () => {
      logEvent('session_ended');
      const endedSessionId = sessionIdRef.current;
      if (!endedSessionId) return;

      try {
        const transcriptToken = await getToken();
        const turns = await getTranscript({
          apiBaseUrl: 'https://api.aethexai.com/api/v1',
          sessionId: endedSessionId,
          headers: { Authorization: `Bearer ${transcriptToken}` },
        });
        const latestUserTurn = [...turns].reverse().find((item) => item.role === 'user');
        const latestAssistantTurn = [...turns].reverse().find((item) => item.role === 'assistant');
        if (latestUserTurn?.text) {
          setTranscript(latestUserTurn.text);
          if (!turn.current?.finalizedTranscriptAt) {
            logEvent('finalized_transcription', { text: latestUserTurn.text });
          }
        }
        if (latestAssistantTurn?.text) setResponse(latestAssistantTurn.text);
      } catch (transcriptError) {
        console.warn('[aethex-profiler] transcript unavailable after call', transcriptError);
      }
    },
    onError: (aethexError) => {
      console.error('[aethex-profiler] call error', aethexError);
      setError(aethexError.message);
    },
    onMetrics: handleMetrics,
  });

  useEffect(() => {
    interruptRef.current = interrupt;
    detector.setCallbacks(
      () => {
        const now = performance.now();
        if (!turn.current) {
          turn.current = {
            turnId: `turn_${Date.now()}`,
            startedAt: now,
          };
        }
        setIsLocallySpeaking(true);
        logEvent('user_speech_start', { turn_id: turn.current.turnId }, now);
      },
      () => {
        const now = performance.now();
        if (turn.current) turn.current.speechEndAt = now;
        setIsLocallySpeaking(false);
        logEvent('user_speech_end', undefined, now);
      },
      () => {
        const now = performance.now();
        const responseMs = turn.current?.responseStartAt === undefined
          ? undefined
          : now - turn.current.responseStartAt;
        interruptRef.current();
        showBargeIn();
        logEvent('barge_in_triggered', { response_ms: responseMs, source: 'vad' }, now);
      },
    );
  }, [detector, interrupt, logEvent, showBargeIn]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    detector.setAgentSpeaking(agentSpeaking);
    if (agentSpeaking && !previousAgentSpeaking.current) {
      const now = performance.now();
      if (turn.current) {
        turn.current.responseStartAt = now;
        turn.current.firstAudioAt = now;
      }
      logEvent('first_remote_audio_activity', undefined, now);
    } else if (!agentSpeaking && previousAgentSpeaking.current) {
      logEvent('response_completed');
      turn.current = null;
    }
    previousAgentSpeaking.current = agentSpeaking;
  }, [agentSpeaking, detector, logEvent]);

  useEffect(() => {
    if (remoteStream) {
      logEvent('remote_stream_received', {
        audio_tracks: remoteStream.getAudioTracks().length,
      });
    }
  }, [remoteStream, logEvent]);

  useEffect(() => () => {
    monitorRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (bargeInTimerRef.current) clearTimeout(bargeInTimerRef.current);
    stop();
  }, [stop]);

  const connect = async () => {
    if (!agentId) {
      setError('Missing NEXT_PUBLIC_AETHEX_AGENT_ID in frontend/.env.local');
      return;
    }

    setError(null);
    setEvents([]);
    setTranscript('');
    setResponse('');
    setBargeInVisible(false);
    const now = performance.now();
    sessionStartedAt.current = now;
    turn.current = null;
    logEvent('session_start', undefined, now);
    await start();
  };

  const disconnect = () => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    localStreamRef.current = null;
    detector.reset();
    stop();
    setIsLocallySpeaking(false);
    setBargeInVisible(false);
  };

  const manualInterrupt = () => {
    if (!agentSpeaking) return;
    const now = performance.now();
    const responseMs = turn.current?.responseStartAt === undefined
      ? undefined
      : now - turn.current.responseStartAt;
    interrupt();
    showBargeIn();
    logEvent('barge_in_triggered', { response_ms: responseMs, source: 'manual' }, now);
  };

  const isActive = isConnecting || isConnected;
  const displayError = error || callError?.message || null;
  const phase: SessionPhase = displayError
    ? 'error'
    : bargeInVisible
      ? 'barge-in'
      : isConnecting
        ? 'connecting'
        : agentSpeaking
          ? 'agent-speaking'
          : isLocallySpeaking
            ? 'user-speaking'
            : isConnected
              ? 'listening'
              : 'idle';

  const statusLabel = {
    idle: 'Ready for session',
    connecting: 'Establishing secure WebRTC link',
    listening: 'Listening for your voice',
    'user-speaking': 'Your voice is live',
    'agent-speaking': 'Aethex is responding',
    'barge-in': 'Response interrupted',
    error: 'Connection needs attention',
  }[phase];

  return (
    <main className="observatory-shell">
      <div className="observatory-grid" aria-hidden="true" />
      <header className="topbar page-width">
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <div>
            <div className="eyebrow">AETHEX / EDGE OBSERVATORY</div>
            <div className="brand-title">Voice Profiler</div>
          </div>
        </div>
        <div className="topbar-meta">
          <span className={`health-dot ${isConnected ? 'is-live' : ''}`} />
          <span>{isConnected ? 'WebRTC live' : isConnecting ? 'Connecting' : 'Offline'}</span>
          <span className="topbar-divider" />
          <span className="mono-text">AGENT {agentId ? agentId.slice(0, 8).toUpperCase() : 'UNSET'}</span>
        </div>
      </header>

      <section className="hero page-width">
        <div className="hero-copy">
          <div className="section-kicker">REAL-TIME VOICE INFRASTRUCTURE</div>
          <h1>Hear the edge.<br /><span>Measure every millisecond.</span></h1>
          <p>
            A live diagnostic console for conversational voice performance,
            routed directly through Aethex WebRTC.
          </p>
        </div>
        <div className="hero-signal" aria-hidden="true">
          <span className="signal-line signal-line-one" />
          <span className="signal-line signal-line-two" />
          <span className="signal-line signal-line-three" />
          <span className="signal-caption">LOW-LATENCY AUDIO PATH</span>
        </div>
      </section>

      <section className="page-width console-layout">
        <div className="voice-console glass-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">LIVE SESSION</div>
              <h2>Aethex voice channel</h2>
            </div>
            <div className={`state-chip state-${phase}`}>
              <span className="state-chip-dot" />
              {statusLabel}
            </div>
          </div>

          <div className={`voice-stage phase-${phase}`}>
            <div className="orb-halo orb-halo-outer" />
            <div className="orb-halo orb-halo-inner" />
            <div className="orb-core">
              <AudioVisualizer
                volume={isLocallySpeaking ? localVolume : agentVolume * 100}
                isActive={isActive}
                phase={phase}
              />
            </div>
            <div className="stage-readout">
              <span className="stage-readout-label">{phase === 'agent-speaking' ? 'REMOTE AUDIO' : 'MIC INPUT'}</span>
              <span className="stage-readout-value">{Math.round((isLocallySpeaking ? localVolume : agentVolume * 100))}%</span>
            </div>
            {bargeInVisible && <div className="interrupt-flash">BARGE-IN / AUDIO QUEUE CLEARED</div>}
          </div>

          <div className="session-status-row">
            <div className="status-detail">
              <span className="status-icon status-icon-mic">◎</span>
              <div>
                <span className="status-detail-label">Microphone</span>
                <strong>{isMuted ? 'Muted' : isLocallySpeaking ? 'Transmitting' : 'Ready'}</strong>
              </div>
            </div>
            <div className="status-detail">
              <span className="status-icon status-icon-audio">◉</span>
              <div>
                <span className="status-detail-label">Audio route</span>
                <strong>{agentSpeaking ? 'Aethex WebRTC' : 'Standing by'}</strong>
              </div>
            </div>
            <div className="quality-badge">
              <span className="quality-bars"><i /><i /><i /><i /></span>
              Clean edge path
            </div>
          </div>

          <div className="console-controls">
            {!isActive ? (
              <button onClick={connect} className="primary-action" aria-label="Start Aethex voice session">
                <span className="action-icon">✦</span>
                <span>Start voice session</span>
                <span className="action-arrow">→</span>
              </button>
            ) : (
              <button onClick={disconnect} className="stop-action" aria-label="Stop Aethex voice session">
                <span className="stop-icon">■</span>
                <span>End session</span>
              </button>
            )}
            <div className="secondary-controls">
              <button
                className={`icon-control ${isMuted ? 'control-active' : ''}`}
                onClick={() => setMuted(!isMuted)}
                disabled={!isActive}
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? '◌' : '◎'}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button
                className={`icon-control ${agentSpeaking ? 'control-active interrupt-control' : ''}`}
                onClick={manualInterrupt}
                disabled={!agentSpeaking}
                aria-label="Interrupt Aethex response"
                title="Interrupt Aethex response"
              >
                ↯
                <span>Interrupt</span>
              </button>
              <label className="volume-control">
                <span aria-hidden="true">◖</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue="1"
                  onChange={(event) => setOutputVolume(Number(event.target.value))}
                  aria-label="Aethex output volume"
                />
                <span aria-hidden="true">◕</span>
              </label>
            </div>
          </div>

          {displayError && (
            <div className="error-banner" role="alert">
              <span className="error-symbol">!</span>
              <span>{displayError}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
            </div>
          )}
        </div>

        <aside className="side-stack">
          <div className="conversation-panel glass-panel">
            <div className="panel-heading compact-heading">
              <div>
                <div className="section-kicker">CONVERSATION TRACE</div>
                <h2>Live exchange</h2>
              </div>
              <span className="live-pulse-label"><i /> LIVE</span>
            </div>
            <div className="conversation-feed">
              <ConversationBubble role="user" text={transcript} pending={!transcript && isLocallySpeaking} />
              <ConversationBubble role="agent" text={response} pending={!response && agentSpeaking} />
              {!transcript && !response && !isLocallySpeaking && !agentSpeaking && (
                <div className="empty-conversation">
                  <span className="empty-orbit">◌</span>
                  <span>Speak naturally to begin the trace.</span>
                </div>
              )}
            </div>
          </div>

          <div className="connection-panel glass-panel">
            <button
              className="connection-toggle"
              onClick={() => setShowConnectionDetails((current) => !current)}
              aria-expanded={showConnectionDetails}
            >
              <span>
                <span className="section-kicker">TRANSPORT</span>
                <strong>Aethex WebRTC link</strong>
              </span>
              <span className="connection-toggle-right">
                <span className={`connection-status ${isConnected ? 'connected' : ''}`}>
                  {isConnected ? 'SECURE / ACTIVE' : isConnecting ? 'NEGOTIATING' : 'IDLE'}
                </span>
                <span className="chevron">{showConnectionDetails ? '⌃' : '⌄'}</span>
              </span>
            </button>
            {showConnectionDetails && (
              <div className="connection-details">
                <div><span>Session</span><strong className="mono-text">{sessionId || 'Not started'}</strong></div>
                <div><span>Remote audio</span><strong>{remoteStream ? 'Attached' : 'Waiting'}</strong></div>
                <div><span>Playback</span><strong>SDK-managed</strong></div>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="page-width profiler-section">
        <LatencyDashboard events={events} isRecording={isActive} />
      </section>

      <footer className="page-width footer-bar">
        <span>AETHEX VOICE INFRASTRUCTURE</span>
        <span className="footer-rule" />
        <span className="mono-text">DIAGNOSTIC MODE / BROWSER TIMING</span>
      </footer>
    </main>
  );
}

function ConversationBubble({
  role,
  text,
  pending,
}: {
  role: 'user' | 'agent';
  text: string;
  pending: boolean;
}) {
  if (!text && !pending) return null;
  const isUser = role === 'user';
  return (
    <div className={`conversation-bubble ${isUser ? 'bubble-user' : 'bubble-agent'}`}>
      <div className="bubble-meta">
        <span className="bubble-avatar">{isUser ? 'YOU' : 'AI'}</span>
        <span>{isUser ? 'Your voice' : 'Aethex agent'}</span>
        <span className="bubble-line" />
      </div>
      {pending ? (
        <div className="typing-dots" aria-label="Waiting for transcript">
          <i /><i /><i />
        </div>
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return undefined;
}
