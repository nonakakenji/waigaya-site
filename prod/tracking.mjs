// 本番の計測タグ（GTM・GA4直・Metaピクセル・LINEクリック計測）。ホームページ（build-prod.mjs）と
// イベントページ（build-event.mjs）で同じものを使うため、ここ1か所にだけ書く
// テンプレートリテラルは使わない（生の改行でJSが死ぬ事故を避ける）

export const GTM = "GTM-P6D9DCST", GA4 = "G-LH7EEZMVNW", PIXEL = "1296465352381188";

// head に入れる計測：旧サイトと同じ3つ（GTM・GA4直・Metaピクセル）。旧サイトの貼り方をそのまま使う
// （GTMの中はClarityだけで、GA4はここの直貼り1本。2026-10-10 に二重計測でないことを確かめた）
export const HEAD_TRACKING = [
  "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" + GTM + "');</script>",
  '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA4 + '"></script>',
  "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','" + GA4 + "');</script>",
  "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','" + PIXEL + "');fbq('track','PageView');</script>",
];

// LINE（lin.ee）のクリック計測。GA4は旧サイトと同じイベント名 line_click_cv（キーイベント設定をそのまま生かす）
// Metaは標準イベント Contact。どのボタンかは place で分ける（ヘッダー・ファーストビュー・下の固定ボタン など）
// Meta広告から来た人の入口を分ける（2026-10-12 決定・D-ads-build.md「LINEの入口の使い分け」）：
//   URL に utm_source=meta があったら sessionStorage に印を残し、そのページと、同じタブでそのあと見るページの
//   LINEボタン lin.ee/wCG7OfR を lin.ee/upx7cmu（広告から来た人の入口）に差し替える。LINEの管理画面の「友だち追加経路」で数が分かれる
//   計測には via=meta を足す（place は同じ）。utm が無ければ何も変えない
export const LINE_DEFAULT = "lin.ee/wCG7OfR", LINE_META = "lin.ee/upx7cmu";
export const LINE_JS = "<script>(function(){var via='';try{if((new URLSearchParams(location.search).get('utm_source')||'').toLowerCase()==='meta')sessionStorage.setItem('wg_via','meta');if(sessionStorage.getItem('wg_via')==='meta')via='meta';}catch(e){if((new URLSearchParams(location.search).get('utm_source')||'').toLowerCase()==='meta')via='meta';}"
  + "if(via==='meta')document.querySelectorAll('a[href*=\"" + LINE_DEFAULT + "\"]').forEach(function(a){a.href=a.href.replace('" + LINE_DEFAULT + "','" + LINE_META + "');});"
  + "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a||!/lin\\.ee|line\\.me/.test(a.href))return;var t=(a.textContent||'').replace(/\\s+/g,'').slice(0,30);var sec=a.closest('section,header,nav,footer');var place=sec?(sec.id||sec.className||sec.tagName).toString().split(' ')[0]:'';var p={link_url:a.href,link_text:t,place:place,transport_type:'beacon'};if(via)p.via=via;if(window.gtag)gtag('event','line_click_cv',p);if(window.fbq)fbq('track','Contact',via?{content_name:t,content_category:via}:{content_name:t});},true);})();</script>";

export const NOSCRIPT = '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' + GTM + '" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=' + PIXEL + '&ev=PageView&noscript=1" alt=""></noscript>';

// body の直後と閉じの前に入れる（head は呼ぶ側が他のmetaと一緒に入れる）。置き場が見つからなければ投げる
export function addBodyTracking(html, label) {
  if (!/<body[^>]*>/.test(html)) throw new Error("<body> が見つからない: " + label);
  if (!/<\/body>/.test(html)) throw new Error("</body> が見つからない: " + label);
  return html.replace(/(<body[^>]*>)/, "$1\n" + NOSCRIPT).replace(/<\/body>/, LINE_JS + "\n</body>");
}

// head（viewport の直後）・body 直後・body 閉じ前、の3か所にまとめて入れる。もう入っていたら二重にしないため止める
export function addTracking(html, label) {
  if (html.includes(GTM) || html.includes(GA4) || html.includes(PIXEL)) throw new Error("計測タグがもう入っている（二重になるので止める）: " + label);
  if (!/<meta name="viewport"[^>]*>/.test(html)) throw new Error('<meta name="viewport"> が見つからない: ' + label);
  html = html.replace(/(<meta name="viewport"[^>]*>)/, "$1\n" + HEAD_TRACKING.join("\n"));
  return addBodyTracking(html, label);
}

// 入ったかの検査：それぞれ1回ずつ。足りない／多いものを返す（空なら合格）
export function checkTracking(html) {
  const once = {
    "GTM本体": "googletagmanager.com/gtm.js?id=",
    "GA4本体": "googletagmanager.com/gtag/js?id=" + GA4,
    "GA4のconfig": "gtag('config','" + GA4 + "')",
    "ピクセル": "fbq('init','" + PIXEL + "')",
    "LINEクリック計測": "'line_click_cv'",
    "GTMのnoscript": "ns.html?id=" + GTM,
  };
  const bad = [];
  for (const [k, s] of Object.entries(once)) {
    const n = html.split(s).length - 1;
    if (n !== 1) bad.push(k + " が " + n + " 回");
  }
  return bad;
}
