"use client";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYMBOLS="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NAMES=["低鼓","拍手","木魚","鈴鼓","小鼓","大鼓","碰鈴","沙鈴","牛鈴","響板","鋼琴低音","鋼琴高音","木琴","馬林巴","鐘琴","吉他","貝斯","口哨","短笛","長笛","單簧管","薩克斯風","小號","長號","法國號","電子音","彈跳音","水滴音","雷射音","泡泡音","咚聲","答聲","亮鈴","暖鐘","歡呼音","星光音"];
const FALLBACK=`# happySenior 拍手節奏設計檔
# 井字號開頭是註解，不會被播放。
# BPM：每分鐘節拍數，建議 40～180。
BPM=96
# TOTAL_LOOPS：全部節奏組完整播放幾輪；0 代表無限循環。
TOTAL_LOOPS=2
# MASTER_VOLUME：樂器音量百分比，範圍 0～100。
MASTER_VOLUME=75
# MUSIC_VOLUME：MP3 背景音量百分比，範圍 0～100。
MUSIC_VOLUME=45
# INSTRUCTOR：模組老師姓名。
INSTRUCTOR=陳裕豐（順豐）
# MODULE：已完成且要顯示的模組；加上 # 就不會顯示。
MODULE=ＣＬ-０１-０４０７義大養生八段錦
MODULE=ＣＬ-０１-０４９２運用中醫多元方式延緩失能（ 五禽戲 ）
# MODULE=ＣＬ-０１-００６０音活音樂體適能
# MODULE=ＣＬ-０１-０４９５小港醫院三動顧健康
# MODULE=ＣＬ-０１-０２６８高醫大出力動起來
MODULE=ＣＬ-０１-０１４２健體防跌協助員
MODULE=ＣＬ-０１-０２６９動動健康班協助員
# GROUP 格式：GROUP=組名|節奏字串|本組循環次數
# 節奏可使用 0-9、A-Z；X 代表休息一拍。
# 本組循環設 0 代表持續循環，不會進到下一組。
GROUP=暖身|10XX10XX|2
GROUP=主節奏|AZBXX10|3
GROUP=收尾|1234XXXX|1
`;

type Group={name:string;sequence:string[];loops:number;raw:string;setName:string};
type Config={groups:Group[];setNames:string[];bpm:number;totalLoops:number;volume:number;musicVolume:number;instructor:string;modules:string[];errors:string[]};

function legacy(value:string){
  const m=value.trim().toUpperCase().match(/^(.*?)(?:-(\d+))?$/);
  return {pattern:(m?.[1]||"").replace(/[\s,，|｜]/g,""),loops:m?.[2]===undefined?1:Number(m[2])};
}
function parseConfig(text:string):Config{
  const config:Config={groups:[],setNames:[],bpm:96,totalLoops:1,volume:75,musicVolume:45,instructor:"",modules:[],errors:[]};
  let currentSet="\u7fa4\u7d441";
  for(const original of text.split(/\r?\n/)){
    const line=original.trim();
    if(!line||line.startsWith("#"))continue;
    const eq=line.indexOf("=");
    if(eq<0){config.errors.push("缺少 = ："+line);continue}
    const key=line.slice(0,eq).trim().toUpperCase();
    const value=line.slice(eq+1).trim();
    if(key==="BPM")config.bpm=Math.min(180,Math.max(40,Number(value)||96));
    else if(key==="TOTAL_LOOPS")config.totalLoops=Math.max(0,Number(value)||0);
    else if(key==="MASTER_VOLUME")config.volume=Math.min(100,Math.max(0,Number(value)||0));
    else if(key==="MUSIC_VOLUME")config.musicVolume=Math.min(100,Math.max(0,Number(value)||0));
    else if(key==="INSTRUCTOR")config.instructor=value;
    else if(key==="MODULE")config.modules.push(value);
    else if(key==="GROUP_SET"){
      currentSet=value||"\u7fa4\u7d44"+(config.setNames.length+1);
      if(!config.setNames.includes(currentSet))config.setNames.push(currentSet);
    }
    else if(key==="GROUP"){
      const parts=value.split("|").map(v=>v.trim());
      let name="",pattern="",loops=1;
      if(parts.length>=3){name=parts[0];pattern=parts[1].toUpperCase();loops=Math.max(0,Number(parts[2])||0)}
      else{const old=legacy(value);name="節奏 "+(config.groups.length+1);pattern=old.pattern;loops=old.loops}
      const invalid=[...pattern].filter(c=>!SYMBOLS.includes(c));
      if(!pattern)config.errors.push((name||"未命名組")+" 沒有節奏");
      else if(invalid.length)config.errors.push((name||"未命名組")+" 有無法辨識的字元："+[...new Set(invalid)].join("、"));
      else config.groups.push({name:name||"節奏 "+(config.groups.length+1),sequence:[...pattern],loops,raw:pattern,setName:currentSet});
    }
  }
  if(!config.groups.length)config.errors.push("至少需要一組 GROUP");
  return config;
}

export default function Home(){
  const [text,setText]=useState(FALLBACK);
  const [source,setSource]=useState("內建範例");
  const [config,setConfig]=useState<Config>(()=>parseConfig(FALLBACK));
  const [profileOpen,setProfileOpen]=useState(true);
  const [selectedModule,setSelectedModule]=useState(0);
  const [activeSet,setActiveSet]=useState("\u7fa4\u7d441");
  const [playing,setPlaying]=useState(false);
  const [groupIndex,setGroupIndex]=useState(0);
  const [stepIndex,setStepIndex]=useState(-1);
  const [groupDone,setGroupDone]=useState(0);
  const [totalDone,setTotalDone]=useState(0);
  const [status,setStatus]=useState("正在讀取 default.txt…");
  const [musicName,setMusicName]=useState("");
  const ctxRef=useRef<AudioContext|null>(null);
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const groupRef=useRef(0),stepRef=useRef(0),groupLoopRef=useRef(0),totalLoopRef=useRef(0);
  const audioRef=useRef<HTMLAudioElement|null>(null),urlRef=useRef<string|null>(null);
  const activeGroups=useMemo(()=>config.groups.filter(g=>g.setName===activeSet),[config.groups,activeSet]);
  const currentGroup=activeGroups[groupIndex]||activeGroups[0];
  const currentSymbol=stepIndex>=0&&currentGroup?currentGroup.sequence[stepIndex]:"♪";

  const applyText=useCallback((content:string,label="文字編輯器")=>{
    const next=parseConfig(content);
    setText(content);setConfig(next);setSource(label);
    setStatus(next.errors.length?next.errors[0]:"已套用 "+next.groups.length+" 組節奏");
  },[]);

  useEffect(()=>{if(config.setNames.length&&!config.setNames.includes(activeSet))setActiveSet(config.setNames[0])},[config.setNames,activeSet]);

  useEffect(()=>{fetch("/default.txt?"+Date.now()).then(r=>{if(!r.ok)throw new Error();return r.text()}).then(t=>applyText(t,"default.txt")).catch(()=>applyText(FALLBACK,"內建範例"));},[applyText]);

  const ctx=useCallback(()=>{if(!ctxRef.current)ctxRef.current=new AudioContext();if(ctxRef.current.state==="suspended")void ctxRef.current.resume();return ctxRef.current},[]);
  const sound=useCallback((s:string,preview=false)=>{
    if(s==="X"&&!preview)return;const i=SYMBOLS.indexOf(s);if(i<0)return;const c=ctx(),now=c.currentTime,g=c.createGain();g.connect(c.destination);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.03,config.volume/100*.34),now+.008);const family=i%6,base=92+i*17;
    if(family===2){const len=Math.floor(c.sampleRate*.16),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);for(let n=0;n<len;n++)d[n]=(Math.random()*2-1)*(1-n/len);const src=c.createBufferSource(),f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=650+i*85;src.buffer=b;src.connect(f);f.connect(g);src.start(now);g.gain.exponentialRampToValueAtTime(.0001,now+.16);return}
    const o=c.createOscillator();o.type=family===0?"sine":family===1?"triangle":family===3?"square":family===4?"sine":"sawtooth";o.frequency.setValueAtTime(base*(family===0?1.4:family===4?3.4:2.1),now);if(family<2)o.frequency.exponentialRampToValueAtTime(Math.max(45,base*.55),now+.18);o.connect(g);o.start(now);const len=family===4?.38:.2;o.stop(now+len);g.gain.exponentialRampToValueAtTime(.0001,now+len-.01);
  },[config.volume,ctx]);

  const stop=useCallback((message="已停止")=>{if(timerRef.current)clearInterval(timerRef.current);timerRef.current=null;setPlaying(false);setStepIndex(-1);setStatus(message);if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0}},[]);

  const tick=useCallback(()=>{
    const groups=activeGroups;if(!groups.length)return;
    const gi=groupRef.current,g=groups[gi],si=stepRef.current,s=g.sequence[si];
    setGroupIndex(gi);setStepIndex(si);setStatus(s==="X"?"第 "+(gi+1)+" 組「"+g.name+"」・休息一拍":"第 "+(gi+1)+" 組「"+g.name+"」・"+s+" "+NAMES[SYMBOLS.indexOf(s)]);sound(s);stepRef.current++;
    if(stepRef.current>=g.sequence.length){
      stepRef.current=0;groupLoopRef.current++;setGroupDone(groupLoopRef.current);
      if(g.loops===0)return;
      if(groupLoopRef.current>=g.loops){
        groupLoopRef.current=0;setGroupDone(0);groupRef.current++;
        if(groupRef.current>=groups.length){
          groupRef.current=0;totalLoopRef.current++;setTotalDone(totalLoopRef.current);
          if(config.totalLoops>0&&totalLoopRef.current>=config.totalLoops)window.setTimeout(()=>stop("全部節奏播放完成！"),Math.max(120,30000/config.bpm));
        }
      }
    }
  },[activeGroups,config,sound,stop]);

  const start=useCallback(()=>{
    if(config.errors.length)return setStatus(config.errors[0]);
    groupRef.current=0;stepRef.current=0;groupLoopRef.current=0;totalLoopRef.current=0;setGroupIndex(0);setStepIndex(-1);setGroupDone(0);setTotalDone(0);setPlaying(true);
    if(audioRef.current&&musicName){audioRef.current.currentTime=0;audioRef.current.volume=config.musicVolume/100;audioRef.current.loop=true;void audioRef.current.play()}
    tick();timerRef.current=setInterval(tick,Math.round(60000/config.bpm));
  },[config,musicName,tick]);

  const selectSet=useCallback((setName:string)=>{stop("\u5df2\u9078\u64c7"+setName+"\uff0c\u6309\u958b\u59cb\u64ad\u653e");setActiveSet(setName);setGroupIndex(0);setStepIndex(-1);setGroupDone(0);setTotalDone(0)},[stop]);

  useEffect(()=>{if(!playing)return;if(timerRef.current)clearInterval(timerRef.current);timerRef.current=setInterval(tick,Math.round(60000/config.bpm));return()=>{if(timerRef.current)clearInterval(timerRef.current)}},[config.bpm,playing,tick]);
  useEffect(()=>{if(audioRef.current)audioRef.current.volume=config.musicVolume/100},[config.musicVolume]);
  useEffect(()=>()=>{if(timerRef.current)clearInterval(timerRef.current);if(urlRef.current)URL.revokeObjectURL(urlRef.current);void ctxRef.current?.close()},[]);

  const loadDesign=(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;file.text().then(t=>applyText(t,file.name))};

  const saveDesign=async()=>{
    const suggested=source.toLowerCase().endsWith(".txt")?source:"happySenior-design.txt";
    const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
    const picker=(window as unknown as {showSaveFilePicker?:(options:unknown)=>Promise<{createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>}>}).showSaveFilePicker;
    if(picker){
      try{
        const handle=await picker({suggestedName:suggested,types:[{description:"文字設計檔",accept:{"text/plain":[".txt"]}}]});
        const writable=await handle.createWritable();await writable.write(blob);await writable.close();setStatus("已另存設計檔："+suggested);return;
      }catch(error){if(error instanceof DOMException&&error.name==="AbortError")return}
    }
    const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=suggested;link.click();URL.revokeObjectURL(url);setStatus("已下載設計檔："+suggested);
  };
  const chooseMusic=(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(urlRef.current)URL.revokeObjectURL(urlRef.current);const u=URL.createObjectURL(file);urlRef.current=u;if(!audioRef.current)audioRef.current=new Audio();audioRef.current.src=u;setMusicName(file.name);setStatus("已載入背景音樂："+file.name)};
  const setParameter=(key:string,value:number)=>{const re=new RegExp("^"+key+"\\s*=.*$","mi");const next=re.test(text)?text.replace(re,key+"="+value):key+"="+value+"\n"+text;applyText(next,source)};

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><img src="/chen-yufong-logo.png" alt="陳裕豐（順豐）的銀髮活力 Logo"/><div><span>happySenior 銀髮活力工具</span><h1>拍手節奏編輯器</h1><p className="instructor-name">指導員：陳裕豐（順豐）</p></div></div><div className="status-pill"><i className={playing?"on":""}/>{playing?"播放中":"待機"}</div></header>
    <section className={"profile-card "+(profileOpen?"expanded":"compact")}>
      <div className="profile-header">
        <div className="profile-title"><img src="/chen-yufong-logo.png" alt="陳裕豐（順豐）Logo"/><div><span>模組老師</span><h2>{config.instructor||"陳裕豐（順豐）"}</h2></div></div>
      </div>
        <button className="profile-toggle icon-button" aria-label={profileOpen?"\u96b1\u85cf\u57fa\u672c\u8cc7\u6599":"\u5c55\u958b\u57fa\u672c\u8cc7\u6599"} title={profileOpen?"\u96b1\u85cf\u57fa\u672c\u8cc7\u6599":"\u5c55\u958b\u57fa\u672c\u8cc7\u6599"} onClick={()=>setProfileOpen(!profileOpen)}><span aria-hidden="true">{profileOpen?"\u2303":"\u2304"}</span></button>
      {profileOpen ? <div className="module-list">{config.modules.map((module,index)=><div key={module+index}><span>{index+1}</span><b>{module}</b></div>)}</div> : <div className="module-picker"><label htmlFor="current-module">目前上課模組</label><select id="current-module" value={selectedModule} onChange={e=>setSelectedModule(Number(e.target.value))}>{config.modules.map((module,index)=><option key={module+index} value={index}>{module}</option>)}</select></div>}
    </section>
    <section className="hero-grid">
      <div className={"beat-stage "+(playing?"is-playing ":"")+(currentSymbol==="X"?"is-rest":"")}><small>現在節拍・第 {groupIndex+1} 組</small><strong className="beat-symbol">{currentSymbol}</strong><b>{currentGroup?.name||"準備開始"}</b><p>{status}</p><div className="progress">{currentGroup?.sequence.map((s,i)=><span key={s+i} className={i===stepIndex?"active":""}>{s}</span>)}</div></div>
      <div className="control-card playlist-card"><div className="playlist-head"><div><span className="source-badge">來源：{source}</span><h2>節奏播放清單</h2></div><b>{config.groups.length} 組</b></div>
        <div className="group-list">{activeGroups.map((g,i)=><div key={g.name+i} className={i===groupIndex&&playing?"group-row current":"group-row"}><span>{i+1}</span><b>{g.name}</b><code>{g.raw}</code><small>{g.loops===0?"無限":g.loops+"次"}</small></div>)}</div>
        {config.errors.length>0&&<div className="error">{config.errors.join("；")}</div>}
        <div className="summary"><div><span>總循環</span><b>{config.totalLoops===0?"無限":config.totalLoops+" 輪"}</b></div><div><span>已完成</span><b>{totalDone} 輪</b></div><div><span>本組完成</span><b>{groupDone} 次</b></div></div>
        <div className="actions"><button className="start" onClick={start} disabled={playing||!!config.errors.length}>▶ 播放全部</button><button onClick={()=>stop()} disabled={!playing}>■ 停止</button></div>
      </div>
    </section>



    <section className="editor-panel">
      <details><summary><span><b>文字設計檔編輯器</b><small>點擊展開，可修改 default.txt 或載入其他設計檔</small></span><strong>展開編輯</strong></summary>
        <div className="editor-toolbar"><div className="editor-actions"><label className="mini-file"><input type="file" accept=".txt,text/plain" onChange={loadDesign}/>讀取其他 .txt</label><button onClick={()=>fetch("/default.txt?"+Date.now()).then(r=>r.text()).then(t=>applyText(t,"default.txt"))}>重新讀取 default.txt</button><button onClick={saveDesign}>另存設計檔</button><button className="apply" onClick={()=>applyText(text,source)}>套用文字內容</button></div><div className="group-tabs" aria-label="節奏群組選擇">{config.setNames.map(setName=><button key={setName} className={setName===activeSet?"selected":""} onClick={()=>selectSet(setName)}>{setName}</button>)}</div></div>
        <textarea value={text} onChange={e=>setText(e.target.value)} spellCheck={false} aria-label="節奏設計檔文字編輯器"/>
        <p>所有參數與格式說明都寫在檔案的 <code># 註解</code> 中；修改後請按「套用文字內容」。</p>
      </details>
    </section>

    <section className="settings-grid">
      <div className="panel"><h2><em>1</em>播放參數</h2><label className="slider"><span>節奏速度</span><b>{config.bpm} BPM</b></label><input type="range" min="40" max="180" value={config.bpm} onChange={e=>setParameter("BPM",Number(e.target.value))}/><label className="slider"><span>總循環次數</span><b>{config.totalLoops===0?"無限":config.totalLoops+" 輪"}</b></label><input className="number-input" type="number" min="0" value={config.totalLoops} onChange={e=>setParameter("TOTAL_LOOPS",Math.max(0,Number(e.target.value)))}/><small className="input-note">輸入 0 代表無限循環</small><label className="slider"><span>樂器音量</span><b>{config.volume}%</b></label><input type="range" min="0" max="100" value={config.volume} onChange={e=>setParameter("MASTER_VOLUME",Number(e.target.value))}/></div>
      <div className="panel"><h2><em>2</em>MP3 背景音樂</h2><label className="file-picker"><input type="file" accept="audio/mp3,audio/mpeg" onChange={chooseMusic}/><i>♫</i><span><b>{musicName||"選擇 MP3 檔案"}</b><small>{musicName?"點此可更換背景音樂":"基於手機安全限制，需在裝置上選取"}</small></span></label><label className="slider"><span>背景音量</span><b>{config.musicVolume}%</b></label><input type="range" min="0" max="100" value={config.musicVolume} onChange={e=>setParameter("MUSIC_VOLUME",Number(e.target.value))}/></div>
    </section>

    <section className="sound-section"><div className="section-title"><em>3</em><div><h2>36 種聲音試聽</h2><p>點一下字元即可試聽；X 在節奏設計中代表休息。</p></div></div><div className="sound-grid">{SYMBOLS.map((s,i)=><button key={s} className={s==="X"?"special":""} onClick={()=>sound(s,true)}><b>{s}</b><span>{NAMES[i]}</span></button>)}</div></section>
    <footer><b>陳裕豐（順豐）</b><span>happySenior・讓每一次拍手都充滿活力</span></footer>
  </main>
}
