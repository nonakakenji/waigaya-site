// イベントページの本番用の書き出し。リポジトリの event/pages/<スラッグ>/ をそのまま写して、
// 中の .html に本番の計測タグ（GTM・GA4・LINEクリック計測・ピクセル）を入れる。アップロードはしない
// 使い方: node prod/build-event.mjs <スラッグ>   → prod/out-event/<スラッグ>/ ができる
// event/pages の中身は書き換えない（計測タグは本番に出すときだけ足す）
import fs from "node:fs";
import path from "node:path";
import { addTracking, checkTracking } from "./tracking.mjs";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const slug = (process.argv[2] || "").trim();
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) { console.error("スラッグが空か、使えない文字が入っている: " + slug); process.exit(1); }
const SRC = path.join(ROOT, "..", "event", "pages", slug);
if (!fs.existsSync(SRC)) { console.error("event/pages/" + slug + "/ が無い"); process.exit(1); }
const OUT = path.join(ROOT, "out-event", slug);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const pages = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".html")) pages.push(p);
  }
})(OUT);

const fail = [];
for (const p of pages) {
  const rel = path.relative(OUT, p);
  try {
    const html = addTracking(fs.readFileSync(p, "utf8"), slug + "/" + rel);
    const bad = checkTracking(html);
    if (bad.length) fail.push(rel + ": " + bad.join(" / "));
    fs.writeFileSync(p, html);
  } catch (e) {
    fail.push(rel + ": " + e.message);
  }
}
if (!pages.length) fail.push("HTMLが1つも無い");
if (fail.length) { console.error("計測タグの差し込みで止めた:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("built prod/out-event/" + slug + "/ : 計測タグを入れたHTML " + pages.length + " 本（" + pages.map(p => path.relative(OUT, p)).join(", ") + "）");
