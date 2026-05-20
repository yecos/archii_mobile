/**
 * useVoiceRecording.ts
 * Hook para grabación de notas de voz (microphone API + MediaRecorder).
 * Extraído de page.tsx para modularización.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { fmtRecTime } from '@/lib/helpers';

interface UseVoiceRecordingReturn {
  /** Is currently recording */
  isRecording: boolean;
  /** Duration in seconds */
  recDuration: number;
  /** Current volume level (0-1) */
  recVolume: number;
  /** Audio preview URL (after stopping) */
  audioPreviewUrl: string | null;
  /** Preview duration in seconds */
  audioPreviewDuration: number;
  /** Currently playing audio ID */
  playingAudio: string | null;
  audioProgress: number;
  audioCurrentTime: number;
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording, returns blob or null */
  stopRecording: () => Promise<Blob | null>;
  /** Discard current preview */
  discardPreview: () => void;
  /** Play/pause a voice message */
  playVoiceMessage: (url: string) => void;
  /** Ref to pending audio blob */
  audioPreviewBlobRef: React.MutableRefObject<Blob | null>;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [recVolume, setRecVolume] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioPreviewDuration, setAudioPreviewDuration] = useState(0);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);

  const mediaRecRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);
  const audioStreamRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const recTimerRef = useRef<any>(null);
  const recAnimRef = useRef<any>(null);
  const audioPreviewBlobRef = useRef<Blob | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mediaRec = new MediaRecorder(stream);
      mediaRecRef.current = mediaRec;

      mediaRec.ondataavailable = (e: any) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRec.start(100);
      setIsRecording(true);
      setRecDuration(0);
      setRecVolume(0);

      // Volume analyser
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setRecVolume(avg / 255);
          recAnimRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      } catch {
        // Analyzer not available, continue without visual feedback
      }

      // Timer
      let sec = 0;
      recTimerRef.current = setInterval(() => {
        sec++;
        setRecDuration(sec);
      }, 1000);
    } catch (err) {
      console.error('[Archii] Error starting recording:', err);
      throw new Error('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecRef.current || !isRecording) {
        resolve(null);
        return;
      }

      mediaRecRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioPreviewBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioPreviewUrl(url);
        setAudioPreviewDuration(recDuration);
        resolve(blob);
      };

      mediaRecRef.current.stop();
      setIsRecording(false);

      // Cleanup
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
      if (recAnimRef.current) { cancelAnimationFrame(recAnimRef.current); recAnimRef.current = null; }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t: any) => t.stop());
        audioStreamRef.current = null;
      }
      analyserRef.current = null;
      setRecVolume(0);
    });
  }, [isRecording, recDuration]);

  const discardPreview = useCallback(() => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    audioPreviewBlobRef.current = null;
    setAudioPreviewDuration(0);
  }, [audioPreviewUrl]);

  const playVoiceMessage = useCallback((url: string) => {
    if (playingAudio === url) {
      // Pause
      if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
      setPlayingAudio(null);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      return;
    }
    if (currentAudioRef.current) { currentAudioRef.current.pause(); }
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    setPlayingAudio(url);
    audio.ontimeupdate = () => {
      setAudioProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      setAudioCurrentTime(audio.currentTime);
    };
    audio.onended = () => {
      setPlayingAudio(null);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      currentAudioRef.current = null;
    };
    audio.onerror = () => {
      console.error('[Archii] Error playing audio');
      setPlayingAudio(null);
      currentAudioRef.current = null;
    };
    audio.play().catch(err => {
      console.error('[Archii] Audio play error:', err);
      setPlayingAudio(null);
      currentAudioRef.current = null;
    });
  }, [playingAudio]);

  // Cleanup on unmount — stop recording, revoke blob URLs, pause audio
  useEffect(() => {
    return () => {
      if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
        try { mediaRecRef.current.stop(); } catch { /* already stopped */ }
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      if (recTimerRef.current) { clearInterval(recTimerRef.current); }
      if (recAnimRef.current) { cancelAnimationFrame(recAnimRef.current); }
      if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
      if (audioPreviewBlobRef.current) {
        // Revoke is handled by discardPreview or stopRecording, but safety net
        audioPreviewBlobRef.current = null;
      }
    };
  }, []);

  return {
    isRecording, recDuration, recVolume,
    audioPreviewUrl, audioPreviewDuration,
    playingAudio, audioProgress, audioCurrentTime,
    startRecording, stopRecording, discardPreview, playVoiceMessage,
    audioPreviewBlobRef,
  };
}
