"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NAMES = ["低鼓","拍手","木魚","鈴鼓","小鼓","大鼓","碰鈴","沙鈴","牛鈴","響板","鋼琴低音","鋼琴高音","木琴","馬林巴","鐘琴","吉他","貝斯","口哨","短笛","長笛","單簧管","薩克斯風","小號","長號","法國號","電子音","彈跳音","水滴音","雷射音","泡泡音","咚聲","答聲","亮鈴","暖鐘","歡呼音","星光音"];

function parsePattern(value: string) {
  const match = value.trim().toUpperCase().match(/^(.*?)(?:-(\d+))?$/);
  const text = (match?.[1] || "").replace(/[\s,，|｜]/g, "");
  const loops = match?.[2] === undefined ? 1 : Number(match[2]);
  if (!text) return { sequence: [] as string[], loops, error: "請輸入至少一個節奏字元" };
  const invalid = [...text].filter((char) => !SYMBOLS.includes(char));
  if (invalid.length) return { sequence: [] as string[], loops, error: "無法辨識：" + [...new Set(invalid)].join("、") };
  return { sequence: [...text], loops, error: "" };
}

export default function Home() {
  const [pattern, setPattern] = useState("10XXAZB-2");
  const [bpm, setBpm] = useState(96);
  const [volume, setVolume] = useState(.75);
  const [musicVolume, setMusicVolume] = useState(.45);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(-1);
  const [doneLoops, setDoneLoops] = useState(0);
  const [musicName, setMusicName] = useState("");
  const [status, setStatus] = useState("準備好了，按「開始播放」試試看！");
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const loopRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const parsed = useMemo(() => parsePattern(pattern), [pattern]);

  const audioContext = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const sound = useCallback((symbol: string, preview = false) => {
    if (symbol === "X" && !preview) return;
    const index = SYMBOLS.indexOf(symbol);
    if (index < 0) return;
    const ctx = audioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.03, volume * .34), now + .008);
    const family = index % 6;
    const base = 92 + index * 17;

    if (family === 2) {
      const length = Math.floor(ctx.sampleRate * .16);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 650 + index * 85;
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      source.start(now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
      return;
    }
    const oscillator = ctx.createOscillator();
    oscillator.type = family === 0 ? "sine" : family === 1 ? "triangle" : family === 3 ? "square" : family === 4 ? "sine" : "sawtooth";
    oscillator.frequency.setValueAtTime(base * (family === 0 ? 1.4 : family === 4 ? 3.4 : 2.1), now);
    if (family < 2) oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, base * .55), now + .18);
    oscillator.connect(gain);
    oscillator.start(now);
    const length = family === 4 ? .38 : .2;
    oscillator.stop(now + length);
    gain.gain.exponentialRampToValueAtTime(.0001, now + length - .01);
  }, [audioContext, volume]);

  const stop = useCallback((message = "已停止") => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
    setActive(-1);
    setStatus(message);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const tick = useCallback(() => {
    if (!parsed.sequence.length) return;
    const index = stepRef.current;
    const symbol = parsed.sequence[index];
    setActive(index);
    setStatus(symbol === "X" ? "休息一拍" : symbol + "・" + NAMES[SYMBOLS.indexOf(symbol)]);
    sound(symbol);
    stepRef.current++;
    if (stepRef.current >= parsed.sequence.length) {
      stepRef.current = 0;
      loopRef.current++;
      setDoneLoops(loopRef.current);
      if (parsed.loops > 0 && loopRef.current >= parsed.loops) {
        window.setTimeout(() => stop("播放完成！"), Math.max(120, 30000 / bpm));
      }
    }
  }, [bpm, parsed, sound, stop]);

  const start = useCallback(() => {
    if (parsed.error) return setStatus(parsed.error);
    if (timerRef.current) clearInterval(timerRef.current);
    stepRef.current = 0;
    loopRef.current = 0;
    setDoneLoops(0);
    setPlaying(true);
    if (audioRef.current && musicName) {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = musicVolume;
      audioRef.current.loop = true;
      void audioRef.current.play().catch(() => setStatus("請再按一次開始，讓瀏覽器播放音樂"));
    }
    tick();
    timerRef.current = setInterval(tick, Math.round(60000 / bpm));
  }, [bpm, musicName, musicVolume, parsed.error, tick]);

  useEffect(() => {
    if (!playing) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, Math.round(60000 / bpm));
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [bpm, playing, tick]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = musicVolume; }, [musicVolume]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    void ctxRef.current?.close();
  }, []);

  const chooseMusic = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    audioRef.current.volume = musicVolume;
    setMusicName(file.name);
    setStatus("已載入背景音樂：" + file.name);
  };

  const current = active >= 0 ? parsed.sequence[active] : "♪";
  const loopLabel = parsed.loops === 0 ? "無限循環" : parsed.loops + " 次";

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><img src="/happySenior-logo.svg" alt="" /><div><span>happySenior 銀髮活力工具</span><h1>拍手節奏編輯器</h1></div></div>
      <div className="status-pill"><i className={playing ? "on" : ""}/>{playing ? "播放中" : "待機"}</div>
    </header>

    <section className="hero-grid">
      <div className={"beat-stage " + (playing ? "is-playing " : "") + (current === "X" ? "is-rest" : "")}>
        <small>現在節拍</small><strong className="beat-symbol">{current}</strong>
        <b>{active < 0 ? "準備開始" : current === "X" ? "休息" : NAMES[SYMBOLS.indexOf(current)]}</b>
        <p>{status}</p>
        <div className="progress">{parsed.sequence.map((s, i) => <span key={s + i} className={i === active ? "active" : ""}>{s}</span>)}</div>
      </div>

      <div className="control-card">
        <label htmlFor="pattern">輸入節奏文字</label>
        <input id="pattern" className="pattern-input" value={pattern} onChange={(e) => setPattern(e.target.value.toUpperCase())} placeholder="例如：10XXAZB-2" spellCheck={false}/>
        <p className="help">0–9、A–Z 是聲音；X 在節奏中代表休息；最後的 -2 代表播放 2 次，-0 代表無限循環。</p>
        {parsed.error && <p className="error">{parsed.error}</p>}
        <div className="summary"><div><span>節拍數</span><b>{parsed.sequence.length}</b></div><div><span>循環</span><b>{loopLabel}</b></div><div><span>已完成</span><b>{doneLoops} 次</b></div></div>
        <div className="actions"><button className="start" onClick={start} disabled={playing || !!parsed.error}>▶ 開始播放</button><button onClick={() => stop()} disabled={!playing}>■ 停止</button></div>
      </div>
    </section>

    <section className="settings-grid">
      <div className="panel">
        <h2><em>1</em>調整速度與音量</h2>
        <label className="slider"><span>節奏速度</span><b>{bpm} BPM</b></label>
        <input type="range" min="40" max="180" value={bpm} onChange={(e) => setBpm(Number(e.target.value))}/>
        <div className="ends"><span>慢 40</span><span>快 180</span></div>
        <label className="slider"><span>樂器音量</span><b>{Math.round(volume * 100)}%</b></label>
        <input type="range" min="0" max="1" step=".05" value={volume} onChange={(e) => setVolume(Number(e.target.value))}/>
      </div>
      <div className="panel">
        <h2><em>2</em>加入 MP3 背景音樂</h2>
        <label className="file-picker"><input type="file" accept="audio/mp3,audio/mpeg" onChange={chooseMusic}/><i>♫</i><span><b>{musicName || "選擇 MP3 檔案"}</b><small>{musicName ? "點此可更換背景音樂" : "檔案只會在你的裝置播放"}</small></span></label>
        <label className="slider"><span>背景音量</span><b>{Math.round(musicVolume * 100)}%</b></label>
        <input type="range" min="0" max="1" step=".05" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))}/>
      </div>
    </section>

    <section className="sound-section">
      <div className="section-title"><em>3</em><div><h2>36 種聲音試聽</h2><p>點一下任一字元即可試聽。X 在編輯節奏時代表休止。</p></div></div>
      <div className="sound-grid">{SYMBOLS.map((s, i) => <button key={s} className={s === "X" ? "special" : ""} onClick={() => sound(s, true)} aria-label={"試聽 " + s + " " + NAMES[i]}><b>{s}</b><span>{NAMES[i]}</span></button>)}</div>
    </section>

    <section className="examples"><h2>快速範例</h2><div>
      <button onClick={() => setPattern("10XX10XX-2")}><code>10XX10XX-2</code><span>兩種聲音，播放 2 次</span></button>
      <button onClick={() => setPattern("1234XXXX-4")}><code>1234XXXX-4</code><span>四個聲音、四拍休息</span></button>
      <button onClick={() => setPattern("A0B1C2XX-0")}><code>A0B1C2XX-0</code><span>無限循環，按停止結束</span></button>
    </div></section>
    <footer>happySenior・讓每一次拍手都充滿活力</footer>
  </main>;
}
