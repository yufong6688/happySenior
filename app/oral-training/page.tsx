"use client";

import { useEffect, useRef, useState } from "react";
import "./styles.css";

type Result = {
  count: number;
  duration: number;
  rate: number;
  events: number[];
};

const DURATIONS = [10, 30, 60];

function formatTime(seconds: number) {
  return `00:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

async function countVoiceBursts(blob: Blob): Promise<Result> {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.02));
  const levels: number[] = [];

  for (let start = 0; start < samples.length; start += frameSize) {
    let sum = 0;
    const end = Math.min(samples.length, start + frameSize);
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / Math.max(1, end - start)));
  }

  const sorted = [...levels].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.3)] || 0.002;
  const peak = sorted[Math.floor(sorted.length * 0.95)] || noise;
  const threshold = Math.max(0.012, noise * 3.2, noise + (peak - noise) * 0.2);
  const release = threshold * 0.58;
  const minActiveFrames = 3;
  const minGapFrames = 8;
  const events: number[] = [];
  let active = false;
  let activeStart = 0;
  let quietFrames = minGapFrames;

  levels.forEach((level, index) => {
    if (!active && level >= threshold && quietFrames >= minGapFrames) {
      active = true;
      activeStart = index;
      quietFrames = 0;
      return;
    }
    if (active) {
      if (level < release) quietFrames += 1;
      else quietFrames = 0;
      if (quietFrames >= 3) {
        if (index - activeStart >= minActiveFrames) events.push(activeStart * 0.02);
        active = false;
      }
    } else {
      quietFrames += 1;
    }
  });

  if (active && levels.length - activeStart >= minActiveFrames) {
    events.push(activeStart * 0.02);
  }

  await context.close();
  const duration = buffer.duration;
  return {
    count: events.length,
    duration,
    rate: duration ? (events.length / duration) * 60 : 0,
    events,
  };
}

export default function OralTrainingPage() {
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [phase, setPhase] = useState<"idle" | "countdown" | "recording" | "analyzing" | "done" | "error">("idle");
  const [countdown, setCountdown] = useState(3);
  const [result, setResult] = useState<Result | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("選擇訓練時間，按下開始後重複唸「叭」");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    timerRef.current = null;
    stopTimeoutRef.current = null;
  };

  const finishRecording = () => {
    clearTimers();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const beginRecording = (recorder: MediaRecorder) => {
    setPhase("recording");
    setMessage("錄音中，請清楚、連續地唸「叭」");
    setRemaining(duration);
    recorder.start(250);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, duration - elapsed));
    }, 200);
    stopTimeoutRef.current = setTimeout(finishRecording, duration * 1000);
  };

  const start = async () => {
    try {
      clearTimers();
      setResult(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setPhase("countdown");
      setCountdown(3);
      setMessage("準備開始");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setPhase("analyzing");
        setMessage("正在分析每一次發聲……");
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        try {
          const nextResult = await countVoiceBursts(blob);
          setResult(nextResult);
          setPhase("done");
          setMessage("分析完成，可播放錄音自行核對");
        } catch {
          setPhase("error");
          setMessage("這個瀏覽器無法分析錄音，請改用最新版 Chrome 或 Safari");
        }
      };

      let value = 3;
      timerRef.current = setInterval(() => {
        value -= 1;
        setCountdown(value);
        if (value <= 0) {
          clearTimers();
          beginRecording(recorder);
        }
      }, 1000);
    } catch {
      setPhase("error");
      setMessage("無法使用麥克風，請在瀏覽器設定中允許麥克風權限");
    }
  };

  useEffect(() => {
    setRemaining(duration);
  }, [duration]);

  useEffect(() => () => {
    clearTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const busy = phase === "countdown" || phase === "recording" || phase === "analyzing";

  return (
    <main className="oral-app">
      <header className="oral-header">
        <div className="oral-mark" aria-hidden="true">叭</div>
        <div>
          <p>口腔肌力日常練習</p>
          <h1>「叭」音訓練計數器</h1>
        </div>
      </header>

      <section className="oral-card oral-stage" aria-live="polite">
        <div className={`oral-orb ${phase}`}>
          {phase === "countdown" ? (
            <strong>{countdown}</strong>
          ) : phase === "done" && result ? (
            <><strong>{result.count}</strong><span>次</span></>
          ) : phase === "analyzing" ? (
            <><strong className="oral-loader">•••</strong><span>分析中</span></>
          ) : (
            <><strong>{formatTime(remaining)}</strong><span>{phase === "recording" ? "錄音中" : "訓練時間"}</span></>
          )}
        </div>
        <h2>{phase === "done" ? `這次完成 ${result?.count ?? 0} 次` : phase === "recording" ? "叭、叭、叭……" : "準備好就開始"}</h2>
        <p>{message}</p>

        <div className="duration-picker" aria-label="選擇訓練時間">
          {DURATIONS.map((seconds) => (
            <button key={seconds} className={duration === seconds ? "selected" : ""} disabled={busy} onClick={() => setDuration(seconds)}>
              {seconds} 秒
            </button>
          ))}
        </div>

        <div className="oral-actions">
          {phase === "recording" ? (
            <button className="stop-button" onClick={finishRecording}>提早結束</button>
          ) : (
            <button className="start-button" disabled={busy} onClick={start}>{phase === "done" || phase === "error" ? "再練一次" : "開始訓練"}</button>
          )}
        </div>
      </section>

      {result && (
        <section className="result-grid" aria-label="訓練結果">
          <article className="oral-card stat"><span>有效發聲</span><strong>{result.count} 次</strong></article>
          <article className="oral-card stat"><span>換算速度</span><strong>{Math.round(result.rate)} 次／分</strong></article>
          <article className="oral-card stat"><span>錄音長度</span><strong>{result.duration.toFixed(1)} 秒</strong></article>
        </section>
      )}

      {audioUrl && (
        <section className="oral-card playback">
          <div><h2>播放錄音核對</h2><p>環境聲、咳嗽或音節黏在一起時，可能影響自動計數。</p></div>
          <audio controls src={audioUrl} />
        </section>
      )}

      <section className="oral-guide">
        <h2>讓計數更準確</h2>
        <div>
          <p><b>1</b><span>在安靜環境使用，手機離嘴巴約一個手臂距離。</span></p>
          <p><b>2</b><span>每次清楚唸「叭」，音節間保留短暫空隙。</span></p>
          <p><b>3</b><span>若用於復健，請依語言治療師建議調整練習強度。</span></p>
        </div>
      </section>
      <footer>本工具提供練習紀錄，不作為醫療診斷依據。</footer>
    </main>
  );
}
