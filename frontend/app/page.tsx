'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioCapture } from '@/lib/audio-capture';
import { VoiceActivityDetector } from '@/lib/vad';
import { WebSocketClient } from '@/lib/websocket-client';
import { LatencyEvent, LatencySummary, ServerMessage } from '@/types';
import LatencyDashboard from '@/components/LatencyDashboard';
import AudioVisualizer from '@/components/AudioVisualizer';

export default function Home() {

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [events, setEvents] = useState<LatencyEvent[]>([]);
  const [summary, setSummary] = useState<LatencySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioCapture = useRef<AudioCapture | null>(null);
  const wsClient = useRef<WebSocketClient | null>(null);
  const vad = useRef<VoiceActivityDetector | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const activeTurnId = useRef<string | null>(null);
  const responseGeneration = useRef(0);
  const audioSequence = useRef(0);

  const stopAgentAudio = () => {
    responseGeneration.current += 1;
    // Post 'clear' to the worklet ring buffer — instant silence on the audio thread
    workletNode.current?.port.postMessage({ type: 'clear' });

    // Update agent speaking state immediately
    setIsAgentSpeaking(false);
    vad.current?.setAgentSpeaking(false);
  };

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    wsClient.current = new WebSocketClient(wsUrl);

    vad.current = new VoiceActivityDetector(
      () => {
        const turnId = `turn_${Date.now()}`;
        activeTurnId.current = turnId;
        setIsSpeaking(true);
        wsClient.current?.sendMessage({
          type: 'start',
          turnId,
          timestamp: performance.now(),
        });
      },
      () => {
        setIsSpeaking(false);
        if (activeTurnId.current) {
          wsClient.current?.sendMessage({
            type: 'stop',
            turnId: activeTurnId.current,
            timestamp: performance.now(),
          });
          activeTurnId.current = null;
        }
      },
      () => {
        console.log('🛑 Barge-in triggered!');
        stopAgentAudio();
        wsClient.current?.sendMessage({
          type: 'barge_in',
          turnId: activeTurnId.current || undefined,
          timestamp: performance.now(),
        });
      }
    );

    return () => {
      audioCapture.current?.stop();
      wsClient.current?.disconnect();
      activeTurnId.current = null;
    };
  }, []);

  const connect = async () => {
    try {
      setError(null);
      await wsClient.current?.connect(
        handleServerMessage,
        () => { console.log('✅ Connected'); setIsConnected(true); },
        () => { console.log('🔌 Disconnected'); setIsConnected(false); }
      );

      // Initialize audio context and worklet for playback
      const audioContextConstructor = window.AudioContext || (
        window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext;
      if (!audioContextConstructor) {
        throw new Error('Web Audio API is not supported in this browser');
      }
      const ctx = new audioContextConstructor({ sampleRate: 16000 });
      audioContext.current = ctx;
      await ctx.audioWorklet.addModule('/pcm-player-processor.js');

      const worklet = new window.AudioWorkletNode(ctx, 'pcm-player-processor');
      worklet.port.onmessage = (event: MessageEvent<{ type?: string; responseId?: number }>) => {
        if (event.data.type === 'drained' && event.data.responseId === responseGeneration.current) {
          setIsAgentSpeaking(false);
          vad.current?.setAgentSpeaking(false);
        }
      };
      worklet.connect(ctx.destination);
      workletNode.current = worklet;

      audioCapture.current = new AudioCapture();
      audioSequence.current = 0;
      await audioCapture.current.initialize(
        (audioData: Float32Array) => {
          const buffer = float32ToInt16(audioData);
          wsClient.current?.sendAudio(
            buffer.buffer as ArrayBuffer,
            audioSequence.current++,
            performance.now()
          );
        },
        (vol: number) => {
          setVolume(vol);
          vad.current?.processVolume(vol);
        }
      );

      setIsRecording(true);
    } catch (err) {
      console.error('Failed to connect:', err);
      setError('Failed to connect. Check microphone permissions.');
    }
  };

  const disconnect = () => {
    audioCapture.current?.stop();
    wsClient.current?.disconnect();
    if (workletNode.current) {
      workletNode.current.disconnect();
      workletNode.current = null;
    }
    if (audioContext.current) {
      void audioContext.current.close();
      audioContext.current = null;
    }
    setIsRecording(false);
    setIsConnected(false);
  };

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'transcript':
        setTranscript(typeof message.data === 'string' ? message.data : '');
        break;
      case 'audio':
        if (typeof message.data === 'string' && typeof message.responseId === 'number') {
          if (message.responseId === responseGeneration.current) {
            scheduleAudioChunk(message.data, message.responseId);
          }
        }
        break;
      case 'latency':
        const latencyEvent = message.data;
        if (isLatencyEvent(latencyEvent)) {
          setEvents((prev) => [...prev, latencyEvent]);
        }
        break;
      case 'summary':
        if (isLatencySummary(message.data)) setSummary(message.data);
        break;
      case 'status':
        if (!isRecord(message.data)) break;
        if (message.data.event === 'agent_speaking_start') {
          const responseId = typeof message.data.responseId === 'number'
            ? message.data.responseId
            : message.responseId;
          if (typeof responseId !== 'number') break;
          if (responseId < responseGeneration.current) break;
          responseGeneration.current = responseId;
          setIsAgentSpeaking(true);
          vad.current?.setAgentSpeaking(true);
          setResponse(typeof message.data.text === 'string' ? message.data.text : '');
        } else if (message.data.event === 'agent_speaking_end') {
          const responseId = typeof message.data.responseId === 'number'
            ? message.data.responseId
            : message.responseId;
          if (responseId !== responseGeneration.current) break;
          workletNode.current?.port.postMessage({
            type: 'response-end',
            responseId,
          });
        }
        break;
      case 'error':
        setError(isRecord(message.data) && typeof message.data.message === 'string'
          ? message.data.message
          : 'An error occurred');
        break;
    }
  };

  const scheduleAudioChunk = (base64Data: string, responseId: number) => {
    if (!workletNode.current) return;
    try {
      // Decode base64 to raw PCM 16-bit bytes
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Safely handle odd-length buffers (Deepgram stream can sometimes flush an odd number of bytes)
      const evenLen = len % 2 === 0 ? len : len - 1;
      const numSamples = evenLen / 2;

      // Convert 16-bit PCM (Int16) to Float32 samples (-1.0 to 1.0)
      const int16Array = new Int16Array(bytes.buffer, 0, numSamples);
      const float32Array = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Feed directly into the AudioWorklet ring buffer
      workletNode.current.port.postMessage({
        type: 'samples',
        samples: float32Array,
        responseId,
      }, [float32Array.buffer]);
    } catch (err) {
      console.error('Failed to schedule audio:', err);
    }
  };

  const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  };

  return (
    <div className="min-h-screen p-8">
      <header className="max-w-7xl mx-auto mb-12">
        <div className="pill mb-4">⚡ Edge-Network Voice Profiler</div>
        <h1 className="display-heading mb-4">
          Measure <span className="accent-italic">latency</span> at every hop
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          A low-level voice infrastructure profiler that strips away abstractions
          to measure exact millisecond costs under real-world network conditions.
        </p>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Voice Interface</h2>
              <div className="status-indicator">
                <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>

            <div className="mb-6">
              <AudioVisualizer volume={volume} isActive={isRecording} />
            </div>

            <div className="flex gap-4 mb-6">
              {isSpeaking && (
                <div className="status-indicator">
                  <div className="status-dot speaking" />
                  <span>You&apos;re speaking</span>
                </div>
              )}
              {isAgentSpeaking && (
                <div className="status-indicator">
                  <div className="status-dot speaking" />
                  <span>Agent speaking</span>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              {!isRecording ? (
                <button onClick={connect} className="btn-primary w-full">
                  🎤 Start Voice Session
                </button>
              ) : (
                <button onClick={disconnect} className="btn-secondary w-full">
                  ⏹️ Stop Session
                </button>
              )}
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
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
                <div className="text-sm font-semibold text-amber-700 mb-1">Agent response:</div>
                <div className="text-gray-800">{response}</div>
              </div>
            )}

            {!transcript && !response && (
              <div className="text-gray-400 text-center py-8">
                Start speaking to see the conversation...
              </div>
            )}
          </div>
        </div>

        <div>
          <LatencyDashboard events={events} summary={summary} isRecording={isRecording} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12">
        <div className="dark-block">
          <h3 className="text-2xl font-bold mb-4">🌐 Network Stress Testing</h3>
          <p className="mb-4 opacity-90">To test under degraded network conditions:</p>
          <ol className="space-y-2 opacity-90">
            <li>1. Open Chrome DevTools (F12)</li>
            <li>2. Go to Network tab → Throttling</li>
            <li>3. Select &quot;Slow 3G&quot; or &quot;Fast 3G&quot;</li>
            <li>4. Watch how latency changes in real-time</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLatencyEvent(value: unknown): value is LatencyEvent {
  return isRecord(value) && typeof value.eventType === 'string' && typeof value.timestamp === 'string';
}

function isLatencySummary(value: unknown): value is LatencySummary {
  return isRecord(value) && typeof value.turnId === 'string';
}
