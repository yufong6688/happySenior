import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);
  workerUrl.searchParams.set("test",process.pid+"-"+Date.now());
  const {default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}
test("server renders the branded multi-group rhythm editor",async()=>{
  const response=await render();assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/happySenior 拍手節奏編輯器/);
  assert.match(html,/節奏播放清單/);
  assert.match(html,/文字設計檔編輯器/);
  assert.match(html,/讀取其他 \.txt/);
  assert.match(html,/總循環次數/);
  assert.match(html,/陳裕豐（順豐）/);
  assert.match(html,/chen-yufong-logo\.png/);
  assert.doesNotMatch(html,/codex-preview|Your site is taking shape/);
});
test("source supports default.txt and multiple groups",async()=>{
  const [page,defaults]=await Promise.all([readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),readFile(new URL("../public/default.txt",import.meta.url),"utf8")]);
  assert.match(page,/fetch\("\/default\.txt/);
  assert.match(page,/GROUP/);
  assert.match(page,/TOTAL_LOOPS/);
  assert.match(page,/file\.text\(\)/);
  assert.match(page,/config\.groups/);
  assert.match(defaults,/GROUP=暖身\|10XX10XX\|2/);
  assert.match(defaults,/TOTAL_LOOPS=2/);
  assert.match(defaults,/# BPM/);
});
