'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioCapture } from '@/lib/audio-capture';
import { VoiceActivityDetector } from '@/lib/vad';
import { WebSocketClient } from '@/lib/websocket-client';
import { LatencyEvent, ServerMessage } from '@/types';
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
  const [error, setError] = useState<string | null>(null);

  const audioCapture = useRef<AudioCapture | null>(null);
  const wsClient = useRef<WebSocketClient | null>(null);
  const vad = useRef<VoiceActivityDetector | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioQueue = useRef<AudioBuffer[]>([]);
  const isPlaying = useRef(false);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    wsClient.current = new WebSocketClient(wsUrl);

    vad.current = new VoiceActivityDetector(
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
      () => {
        console.log('🛑 Barge-in triggered!');
        stopAgentAudio();
        wsClient.current?.sendMessage({ type: 'barge_in', timestamp: performance.now() });
      }
    );

    return () => disconnect();
  }, []);

  const connect = async () => {
    try {
      setError(null);
      await wsClient.current?.connect(
        handleServerMessage,
        () => { console.log('✅ Connected'); setIsConnected(true); },
        () => { console.log('🔌 Disconnected'); setIsConnected(false); }
      );

      audioCapture.current = new AudioCapture();
      await audioCapture.current.initialize(
        (audioData: Float32Array) => {
          const buffer = float32ToInt16(audioData);
          wsClient.current?.sendAudio(buffer.buffer as ArrayBuffer);
        },
        (vol: number) => {
          setVolume(vol);
          vad.current?.processVolume(vol);
        }
      );

      audioContext.current = new AudioContext({ sampleRate: 16000 });
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to connect:', err);
      setError('Failed to connect. Check microphone permissions.');
    }
  };

  const disconnect = () => {
    audioCapture.current?.stop();
    wsClient.current?.disconnect();
    setIsRecording(false);
    setIsConnected(false);
  };

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'transcript':
        setTranscript(message.data.text || '');
        break;
      case 'audio':
        if (message.data) playAudioChunk(message.data);
        break;
      case 'latency':
        if (message.data) setEvents((prev) => [...prev, message.data]);
        break;
      case 'status':
        if (message.data?.event === 'agent_speaking_start') {
          setIsAgentSpeaking(true);
          vad.current?.setAgentSpeaking(true);
          setResponse(message.data.text || '');
        } else if (message.data?.event === 'agent_speaking_end') {
          setIsAgentSpeaking(false);
          vad.current?.setAgentSpeaking(false);
        }
        break;
      case 'error':
        setError(message.data?.message || 'An error occurred');
        break;
    }
  };

  const playAudioChunk = async (audioData: string) => {
    if (!audioContext.current) return;
    try {
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBuffer = await audioContext.current.decodeAudioData(bytes.buffer as ArrayBuffer);
      audioQueue.current.push(audioBuffer);
      if (!isPlaying.current) playNextChunk();
    } catch (err) {
      console.error('Failed to play audio:', err);
    }
  };

  const playNextChunk = () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }
    if (!audioContext.current) return;
    isPlaying.current = true;
    const buffer = audioQueue.current.shift()!;
    const source = audioContext.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.current.destination);
    source.onended = () => playNextChunk();
    source.start();
  };

  const stopAgentAudio = () => {
    audioQueue.current = [];
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = new AudioContext({ sampleRate: 16000 });
    }
    isPlaying.current = false;
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
          <LatencyDashboard events={events} isRecording={isRecording} />
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
