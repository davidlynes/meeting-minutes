import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useAudioPlayer = (audioPath: string | null) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number>();
  const seekTimeRef = useRef<number>(0);

  const initAudioContext = async () => {
    try {
      if (!audioRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioRef.current = new AudioContextClass();
      }

      if (audioRef.current.state === 'suspended') {
        await audioRef.current.resume();
      }

      setError(null);
      return true;
    } catch (error) {
      console.error('Error initializing AudioContext:', error);
      setError('Failed to initialize audio');
      return false;
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.close();
      }
    };
  }, []);

  const loadAudio = async () => {
    if (!audioPath) return;

    try {
      const initialized = await initAudioContext();
      if (!initialized || !audioRef.current) return;

      const result = await invoke<number[]>('read_audio_file', {
        filePath: audioPath
      });

      if (!result || result.length === 0) {
        throw new Error('Empty audio data received');
      }

      const audioData = new Uint8Array(result).buffer;

      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioRef.current!.decodeAudioData(
          audioData,
          buffer => resolve(buffer),
          error => reject(new Error('Failed to decode audio data: ' + error))
        );
      });

      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      setCurrentTime(0);
      setError(null);
    } catch (error) {
      console.error('Error loading audio:', error);
      setError('Failed to load audio file');
    }
  };

  // Load audio when path changes
  useEffect(() => {
    if (audioPath) {
      loadAudio();
    }
  }, [audioPath]);

  const stopPlayback = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch (_) { /* source already stopped */ }
      sourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const play = async () => {
    try {
      const initialized = await initAudioContext();
      if (!initialized) throw new Error('Audio context initialization failed');
      if (!audioRef.current) throw new Error('Audio context is null after initialization');
      if (!audioBufferRef.current) throw new Error('No audio buffer loaded');
      if (audioRef.current.state !== 'running') {
        throw new Error(`Audio context is in invalid state: ${audioRef.current.state}`);
      }

      stopPlayback();

      sourceRef.current = audioRef.current.createBufferSource();
      sourceRef.current.buffer = audioBufferRef.current;
      sourceRef.current.connect(audioRef.current.destination);

      sourceRef.current.onended = () => {
        stopPlayback();
        setCurrentTime(0);
      };

      const startTime = seekTimeRef.current;
      startTimeRef.current = audioRef.current.currentTime - startTime;
      sourceRef.current.start(0, startTime);
      setIsPlaying(true);
      setError(null);

      // Setup time update (runs at ~60fps — no logging in this loop)
      const updateTime = () => {
        if (!audioRef.current || !sourceRef.current) return;

        const newTime = audioRef.current.currentTime - startTimeRef.current;

        if (newTime >= duration) {
          stopPlayback();
          setCurrentTime(0);
          seekTimeRef.current = 0;
        } else {
          setCurrentTime(newTime);
          seekTimeRef.current = newTime;
          rafRef.current = requestAnimationFrame(updateTime);
        }
      };
      
      rafRef.current = requestAnimationFrame(updateTime);
    } catch (error) {
      console.error('Error during playback:', error);
      setError('Failed to play audio');
      stopPlayback();
    }
  };

  const seek = async (time: number) => {
    if (time < 0) time = 0;
    if (time > duration) time = duration;

    const wasPlaying = isPlaying;
    stopPlayback();
    seekTimeRef.current = time;
    setCurrentTime(time);

    if (wasPlaying) await play();
  };

  const pause = () => {
    stopPlayback();
  };

  return {
    isPlaying,
    currentTime,
    duration,
    error,
    play,
    pause,
    seek
  };
};
