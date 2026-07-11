import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", process.pid + "-" + Date.now());
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the happySenior rhythm editor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>happySenior 拍手節奏編輯器<\/title>/i);
  assert.match(html, /拍手節奏編輯器/);
  assert.match(html, /10XXAZB-2/);
  assert.match(html, /36 種聲音試聽/);
  assert.match(html, /選擇 MP3 檔案/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("client source includes rhythm, looping, and audio controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
  assert.match(page, /parsed\.loops === 0/);
  assert.match(page, /new AudioContext/);
  assert.match(page, /accept="audio\/mp3,audio\/mpeg"/);
  assert.match(page, /setInterval/);
  assert.match(page, /symbol === "X"/);
});
