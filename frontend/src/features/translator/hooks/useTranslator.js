import { useState, useEffect, useCallback, useRef } from 'react';
import { splitIntoWords, calculateProgress } from '../../../utils';
import { SPEED_OPTIONS } from '../../../constants';
import { transcribeVideo as transcribeVideoAPI } from '../../../services/api';
import { useAvatarPlaybackStore } from '../../../avatar/playbackStore';

const useTranslator = (initialText = '') => {
  const [inputText,        setInputText]        = useState(initialText);
  const [activeTab,        setActiveTab]        = useState('text');
  const [isPlaying,        setIsPlaying]        = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [speed,            setSpeed]            = useState(1);
  const [loop,             setLoop]             = useState(false);
  const [videoUrl,         setVideoUrl]         = useState('');
  const [isTranscribing,   setIsTranscribing]   = useState(false);

  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; }, [loop]);

  const store = useAvatarPlaybackStore();

  // Propagate speed changes to the animator in real time
  useEffect(() => {
    store.setSpeed(speed);
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const words    = splitIntoWords(inputText);
  const progress = calculateProgress(currentWordIndex, words.length);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    });
  }, []);

  // ── Wait for avatar API (handles race where user plays before model loads) ─
  const waitForApi = useCallback(
    () =>
      new Promise((resolve) => {
        if (useAvatarPlaybackStore.getState().api) { resolve(); return; }
        const unsub = useAvatarPlaybackStore.subscribe((state) => {
          if (state.api) { unsub(); resolve(); }
        });
        // Timeout after 10 s so the promise never hangs forever
        setTimeout(() => { unsub(); resolve(); }, 10_000);
      }),
    [],
  );

  // ── Sequential playback ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || words.length === 0) return;

    let cancelled = false;

    const run = async () => {
      // Ensure avatar is loaded before we start
      await waitForApi();
      if (cancelled) return;

      // Re-apply current speed in case it changed before play was pressed
      store.setSpeed(speed);

      let firstIteration = true;

      do {
        // On subsequent loop iterations always restart from word 0
        const from = firstIteration ? (currentWordIndex >= 0 ? currentWordIndex : 0) : 0;
        firstIteration = false;

        for (let i = from; i < words.length; i++) {
          if (cancelled) return;
          setCurrentWordIndex(i);
          await store.sign(words[i]);
          if (cancelled) return;
        }
      } while (!cancelled && loopRef.current);

      // Smoothly lower arm at end of sequence
      if (!cancelled) {
        await store.lowerArm();
        setIsPlaying(false);
        setCurrentWordIndex(-1);
      }
    };

    run();

    return () => {
      cancelled = true;
      store.stop();
    };
  }, [isPlaying]); // intentionally narrow — loop owns sequencing

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentWordIndex(-1);
    store.stop();
  }, [store]);

  const togglePlay = useCallback(() => {
    if (words.length === 0) return;
    setIsPlaying((prev) => !prev);
  }, [words.length]);

  const startConversion = useCallback(() => {
    if (!inputText.trim()) return;
    setCurrentWordIndex(0);
    setIsPlaying(true);
  }, [inputText]);

  const updateText = useCallback(
    (text) => {
      setInputText(text);
      reset();
    },
    [reset],
  );

  const updateVideoUrl = useCallback((url) => setVideoUrl(url), []);

  const transcribeVideo = useCallback(async () => {
    if (!videoUrl.trim()) return;
    setIsTranscribing(true);
    try {
      const result = await transcribeVideoAPI(videoUrl, 3600);
      setInputText(result.text);
    } catch (err) {
      console.error('[SignBridge] Transcription error:', err.message);
      alert(`Transcription failed: ${err.message}\n\nMake sure the backend server is running at localhost:8000.`);
    } finally {
      setIsTranscribing(false);
    }
  }, [videoUrl]);

  return {
    inputText,
    activeTab,
    setActiveTab,
    isPlaying,
    currentWordIndex,
    words,
    progress,
    speed,
    setSpeed,
    cycleSpeed,
    loop,
    setLoop,
    videoUrl,
    isTranscribing,
    reset,
    togglePlay,
    startConversion,
    updateText,
    updateVideoUrl,
    transcribeVideo,
  };
};

export default useTranslator;
