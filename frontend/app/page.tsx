'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTranscript,
  PipelineMetrics,
  WebRTCPlatform,
  useAethexCall,
  webPlatform,
} from '@aethexai/react';
import AudioVisualizer from '@/components/AudioVisualizer';
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

export default function Home() {
  const [events, setEvents] = useState<LatencyEvent[]>([]);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [localVolume, setLocalVolume] = useState(0);
  const [isLocallySpeaking, setIsLocallySpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionStartedAt = useRef<number | null>(null);
  const turn = useRef<TurnState | null>(null);
  const previousAgentSpeaking = useRef(false);
  const interruptRef = useRef<() => void>(() => undefined);
  const monitorRef = useRef<LocalVadMonitor | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

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

  // The platform is intentionally stable for the lifetime of the component;
  // Aethex owns the actual microphone transport.
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
    isSpeaking: agentSpeaking,
    volume: agentVolume,
    remoteStream,
    sessionId,
    error: callError,
    start,
    stop,
    interrupt,
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
        logEvent('barge_in_triggered', { response_ms: responseMs }, now);
      },
    );
  }, [detector, interrupt, logEvent]);

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
  };

  const isActive = isConnecting || isConnected;
  const displayError = error || callError?.message || null;

  return (
    <div className="min-h-screen p-8">
      <header className="max-w-7xl mx-auto mb-12">
        <div className="pill mb-4">⚡ Aethex Edge-Network Voice Profiler</div>
        <h1 className="display-heading mb-4">
          Measure <span className="accent-italic">latency</span> at every hop
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          A WebRTC diagnostic profiler for Aethex conversational infrastructure.
        </p>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Aethex Voice Interface</h2>
              <div className="status-indicator">
                <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
                <span>{isConnecting ? 'Connecting' : isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>

            <div className="mb-6">
              <AudioVisualizer
                volume={isLocallySpeaking ? localVolume : agentVolume * 100}
                isActive={isActive}
              />
            </div>

            <div className="flex gap-4 mb-6">
              {isLocallySpeaking && (
                <div className="status-indicator">
                  <div className="status-dot speaking" />
                  <span>You&apos;re speaking</span>
                </div>
              )}
              {agentSpeaking && (
                <div className="status-indicator">
                  <div className="status-dot speaking" />
                  <span>Aethex agent speaking</span>
                </div>
              )}
            </div>

            {!isActive ? (
              <button onClick={connect} className="btn-primary w-full">
                🎤 Start Aethex Session
              </button>
            ) : (
              <button onClick={disconnect} className="btn-secondary w-full">
                ⏹️ Stop Session
              </button>
            )}

            {displayError && (
              <div className="mt-4 flex items-center justify-between gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <span>{displayError}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="error-dismiss"
                  aria-label="Dismiss error"
                  title="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-xl font-bold mb-4">Conversation</h3>
            {transcript && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <div className="text-sm font-semibold text-blue-700 mb-1">You said:</div>
                <div className="text-gray-800">{transcript}</div>
              </div>
            )}
            {response && (
              <div className="p-4 bg-amber-50 rounded-lg">
                <div className="text-sm font-semibold text-amber-700 mb-1">Aethex response:</div>
                <div className="text-gray-800">{response}</div>
              </div>
            )}
            {!transcript && !response && (
              <div className="text-gray-400 text-center py-8">
                Start speaking to see metrics and conversation data...
              </div>
            )}
          </div>
        </div>

        <div>
          <LatencyDashboard events={events} isRecording={isActive} />
        </div>
      </div>
    </div>
  );
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return undefined;
}
