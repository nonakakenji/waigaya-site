// 本番（sharehouse-waigaya.com）用の書き出し。ローカルに out/ を作るだけ。アップロードはしない
// 使い方: node build-prod.mjs
// 元：プレビューの src/index.html（../hp/src/index.html）
//     ＋ 写真 ../photos/web/photos.json（どちらもこのリポジトリの中）
// プレビュー側（build.mjs・public/）には一切書き込まない
// out/ の中身＝本番の public_html に置くもの（index.html・kurashi/ LP40/ LP20/ の index.html・img/・sitemap-static.xml）
// テンプレートリテラルは使わない（生の改行でJSが死ぬ事故を避ける）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { GTM, GA4, PIXEL, HEAD_TRACKING, addBodyTracking } from "./tracking.mjs"; // 計測タグはイベントページと共通

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PREVIEW = process.env.PREVIEW_DIR || path.join(ROOT, "..", "hp");
const WEB = process.env.PHOTOS_DIR || path.join(ROOT, "..", "photos", "web");
const OUT = path.join(ROOT, "out");
const SITE = "https://sharehouse-waigaya.com";

const TITLE = "シェアハウス わいが舎｜枚方";
const DESC = "個室16.5㎡（10畳）とリビング40畳。一人暮らしの自由はそのままに暮らせる、大阪府枚方市のシェアハウス わいが舎。内覧（30分）はLINEで受け付けています。";
const FAVICON = "/assets/d06e2f353a559bd2.png"; // 旧サイトの favicon。本番の /assets/ に残っているものを指す
const OG_SLOT = "05-06"; // 昼のリビングで大人たちが食卓を囲む写真（子どもは写っていない）
const OLD_PAGES = ["kurashi", "LP40", "LP20"]; // 同じURLのまま中身を新サイトにする（canonical はトップ）

const src = fs.readFileSync(path.join(PREVIEW, "src", "index.html"), "utf8");
const pj = JSON.parse(fs.readFileSync(path.join(WEB, "photos.json"), "utf8"));
const bySlot = {};
for (const p of pj.photos) bySlot[p.file.replace(/\.[^.]+$/, "")] = p;
for (const p of pj.owners || []) if (p.sizes) bySlot[p.file.replace(/\.[^.]+$/, "")] = p;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function attrs(str) { const o = {}; str.replace(/(\w+)="([^"]*)"/g, (m, k, v) => { o[k] = v; }); return o; }
const hash = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 8);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const used = [];
function copyImg(rel) {
  const from = path.join(WEB, rel), to = path.join(OUT, "img", rel);
  if (!fs.existsSync(from)) throw new Error("写真が見つからない: " + from);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  used.push(rel);
  return "/img/" + rel + "?v=" + hash(from);
}

// ---- 写真の差し込み（プレビューの build.mjs と同じ作り） ----
const missing = [];
let html = src.replace(/\{\{ph ([^}]*)\}\}/g, (m, s) => {
  const a = attrs(s); const p = bySlot[a.slot];
  if (!p) { missing.push(a.slot); return ""; }
  const s800 = p.sizes["800"], s1600 = p.sizes["1600"];
  const u800 = copyImg(s800.src), u1600 = copyImg(s1600.src);
  const style = [];
  if (a.r) style.push("--r:" + a.r);
  if (a.pos) style.push("--pos:" + a.pos);
  const load = a.eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"';
  const img = '<img src="' + u800 + '" srcset="' + u800 + " " + s800.width + "w, " + u1600 + " " + s1600.width + 'w" sizes="(min-width:1120px) 1080px, 100vw" width="' + s1600.width + '" height="' + s1600.height + '" alt="' + esc(p.alt || "") + '"' + load + ">";
  const cap = a.cap === "1" ? p.caption : a.cap;
  return '<figure class="ph"><div class="ph-box"' + (style.length ? ' style="' + style.join(";") + '"' : "") + ">" + img + "</div>" + (cap ? "<figcaption>" + esc(cap) + "</figcaption>" : "") + "</figure>";
});
if (missing.length) { console.error("photos.json に無い写真の枠がある。本番用は作らない:", missing); process.exit(1); }

// ---- OGP画像 1200×630（JPEGの中身とjpg拡張子を一致させる） ----
const ogSrc = path.join(WEB, bySlot[OG_SLOT].sizes["1600"].src);
const ogOut = path.join(OUT, "img", "og.jpg");
// 幅1200に縮めて、上下の真ん中を630の高さで切る。Mac でも GitHub の Linux でも動くよう Pillow（python3）で作る
const OG_PY = [
  "import sys",
  "from PIL import Image",
  "im = Image.open(sys.argv[1]).convert('RGB')",
  "h = round(im.height * 1200 / im.width)",
  "im = im.resize((1200, h), Image.LANCZOS)",
  "top = (h - 630) // 2",
  "im.crop((0, top, 1200, top + 630)).save(sys.argv[2], 'JPEG', quality=85)",
].join("\n");
execFileSync("python3", ["-c", OG_PY, ogSrc, ogOut], { stdio: "inherit" });
const ogUrl = SITE + "/img/og.jpg?v=" + hash(ogOut);

// ---- プレビュー専用のものを外す ----
function must(re, to, label) {
  if (!re.test(html)) { console.error("置き換え元が見つからない（プレビューの形が変わった？）: " + label); process.exit(1); }
  html = html.replace(re, to);
}
must(/<meta name="robots" content="noindex, nofollow">\n?/, "", "noindex");
must(/<title>[^<]*<\/title>/, "<title>" + esc(TITLE) + "</title>", "title");
must(/<link rel="icon" href="data:,">/, '<link rel="icon" type="image/png" href="' + FAVICON + '">\n<link rel="apple-touch-icon" href="' + FAVICON + '">', "favicon");
must(/わいが舎 作り直し プレビュー/, "わいが舎 トップページ", "CSSの見出しコメント");
must(/\s*<span class="perm">[^<]*<\/span>/, '\n  <p class="ft-links"><a href="/privacy/">プライバシーポリシー</a></p>', "フッターの試作表記");
must(/<\/style>/, ".ft .ft-links{margin:18px 0 0;font-size:12px}.ft .ft-links a{color:inherit;opacity:.75}\n</style>", "フッターのリンクの見た目");

const HEAD_TAGS = [
  '<meta name="description" content="' + esc(DESC) + '">',
  '<link rel="canonical" href="' + SITE + '/">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="シェアハウス わいが舎">',
  '<meta property="og:title" content="' + esc(TITLE) + '">',
  '<meta property="og:description" content="' + esc(DESC) + '">',
  '<meta property="og:url" content="' + SITE + '/">',
  '<meta property="og:image" content="' + ogUrl + '">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:locale" content="ja_JP">',
  '<meta name="twitter:card" content="summary_large_image">',
  ...HEAD_TRACKING, // 計測（GTM・GA4直・Metaピクセル）。中身は tracking.mjs
].join("\n");
must(/(<meta name="viewport"[^>]*>)/, "$1\n" + HEAD_TAGS, "headへの差し込み");

// body直後（noscript）と body閉じ前（LINEクリック計測）。中身は tracking.mjs
html = addBodyTracking(html, "hp/src/index.html");

// ---- 残っていたら止める検査 ----
const fail = [];
if (/noindex/i.test(html)) fail.push("noindex が残っている");
if (/プレビュー|試作/.test(html)) fail.push("「プレビュー」「試作」が残っている: " + (html.match(/.{0,20}(プレビュー|試作).{0,20}/g) || []).join(" / "));
if (/\{\{/.test(html)) fail.push("置き換え漏れ {{ }}");
if (/矛盾/.test(html)) fail.push("「矛盾」がある（正しくは「矛と盾」）");
if (/許可待ち|確認中/.test(html)) fail.push("「許可待ち」「確認中」が残っている");
if (/data:,/.test(html)) fail.push("favicon が空のまま");
for (const k of [GTM, GA4, PIXEL, "line_click_cv", 'rel="canonical"', "og:image", 'name="description"']) if (!html.includes(k)) fail.push(k + " が無い");
if ((html.match(/href="https:\/\/lin\.ee\//g) || []).length < 5) fail.push("lin.ee のリンクが少なすぎる（プレビューは9か所）");
if (/waigaya-site-preview|workers\.dev/.test(html)) fail.push("プレビューのURLが入っている");
if (fail.length) { console.error("本番用の検査で止めた:\n- " + fail.join("\n- ")); process.exit(1); }

fs.writeFileSync(path.join(OUT, "index.html"), html);

// ---- 旧ページ：同じURLのまま中身を新サイトに（canonical・og:url はトップのまま＝重複はトップに寄せる） ----
for (const d of OLD_PAGES) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
  fs.writeFileSync(path.join(OUT, d, "index.html"), html);
}

// ---- sitemap：トップだけにする（旧ページは canonical がトップなので載せない。/thanks はSTUDIOの名残） ----
fs.writeFileSync(path.join(OUT, "sitemap-static.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>' + SITE + "/</loc>\n</url>\n</urlset>\n");

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(OUT);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log("built out/ : index.html " + html.length + " bytes / 写真ファイル " + used.length + "＋og.jpg / 旧ページ " + OLD_PAGES.join(",") + " / 全 " + files.length + " ファイル " + (bytes / 1048576).toFixed(1) + "MB");
