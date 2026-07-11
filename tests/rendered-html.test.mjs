import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);
  workerUrl.searchParams.set("test",process.pid+"-"+Date.now());
  const {default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}
test("server renders profile and active modules",async()=>{
  const response=await render();assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/happySenior 拍手節奏編輯器/);
  assert.match(html,/陳裕豐（順豐）/);
  const start=html.indexOf('<div class="module-list">');
  const end=html.indexOf("</section>",start);
  const moduleSection=html.slice(start,end);
  assert.match(moduleSection,/ＣＬ-０１-０４０７義大養生八段錦/);
  assert.match(moduleSection,/ＣＬ-０１-０４９２運用中醫多元方式延緩失能/);
  assert.match(moduleSection,/ＣＬ-０１-０１４２健體防跌協助員/);
  assert.match(moduleSection,/ＣＬ-０１-０２６９動動健康班協助員/);
  assert.doesNotMatch(moduleSection,/ＣＬ-０１-００６０音活音樂體適能/);
  assert.doesNotMatch(moduleSection,/ＣＬ-０１-０４９５小港醫院三動顧健康/);
  assert.doesNotMatch(moduleSection,/ＣＬ-０１-０２６８高醫大出力動起來/);
  assert.match(html,/另存設計檔/);
});
test("default document controls profile, comments, groups, and saving",async()=>{
  const [page,defaults]=await Promise.all([readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),readFile(new URL("../public/default.txt",import.meta.url),"utf8")]);
  assert.match(page,/key==="INSTRUCTOR"/);
  assert.match(page,/key==="MODULE"/);
  assert.match(page,/line\.startsWith\("#"\)/);
  assert.match(page,/showSaveFilePicker/);
  assert.match(page,/link\.download/);
  assert.match(defaults,/INSTRUCTOR=陳裕豐（順豐）/);
  assert.match(defaults,/MODULE=ＣＬ-０１-０４０７義大養生八段錦/);
  assert.match(defaults,/# MODULE=ＣＬ-０１-００６０音活音樂體適能/);
  assert.match(defaults,/GROUP=暖身\|10XX10XX\|2/);
});
