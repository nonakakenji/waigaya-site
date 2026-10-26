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
// 申し込み（2026-10-18 改善提案1・健ちゃん実施）：LINEボタンと Googleフォームのリンクを押したら、Metaの標準イベント Lead も送る。
//   広告の学習を「ページを開いた人」から「申し込み」に切り替えるための数をためる（切り替えは10/25以降に司令塔が判断）
//   content_category は line / form（広告から来た人は line_meta / form_meta）。HPの内覧はLINEのメニューから申し込むので、HPではLINEボタンが申し込み
// line_click（2026-10-27 健ちゃんOK・朝の提案1）：広告A・Dから来た人がLINEの友だち追加まで進まない原因を見るため、
//   同じ押下で GA4 にもう1つ line_click を送る。どのページ（click_page＝パス）・どのボタン（click_button＝囲みの id か class
//   とページ内で何番目のLINEリンクか。漫画ページなら mid-1・end-2・fix-3）・どの広告から（ad_content＝utm_content。広告以外は (none)）
//   line_click_cv はキーイベントの設定と今までの数を生かすため、そのまま残す（数えるのは別のイベント名なので二重にはならない）
//   GTM の中は Clarity だけで GA4 タグは無い（2026-10-27 gtm.js で確かめた）。GA4 に送るのはここの gtag だけ
export const LINE_DEFAULT = "lin.ee/wCG7OfR", LINE_META = "lin.ee/upx7cmu";
// 友だち追加経路（2026-10-22・~/squad-reports/わいが舎/line-funnel-1022.md）：LINE Manager の［友だち追加ガイド］＞［友だち追加経路を設定］で
//   作ったURLを入れると、そのURLに差し替える（Managerの［分析］＞［友だち］＞［追加経路］で経路ごとの友だち追加が分かれる）。空なら今までどおり
//   manga_A … 広告 utm_content=A-manga で来た人／manga_D … D-manga／hp_ad … それ以外の内覧広告（A・D の HPトップ行き）／manga_direct … 広告以外で漫画ページに来た人
//   イベント広告（B・C）は今までどおり LINE_META
export const LINE_ROUTES = { manga_A: "", manga_D: "", hp_ad: "", manga_direct: "" };
// ボタン→友だち追加のタップを1つ減らす（2026-10-22）：iPhoneのインスタ・Facebookのアプリ内ブラウザでは lin.ee → line.me のあと
//   「Open LINE」の白いページでもう1回押させる。その白いページのボタンと同じ line:// へ直接飛ばす。LINEが開かなければ（入っていない・
//   「開きますか」で止めた）2.5秒後に元の lin.ee へ進む（今までと同じ道）。ts は lin.ee が line.me に付けるもの（Managerの経路の印）
//   lin.ee の後ろ → line:// の対応。新しい経路のURLを足したら、ここにも1行足す（curl -sI でその lin.ee の行き先を見て ts を写す）
export const LINE_APP = { "wCG7OfR": "line://ti/p/@144uhrtx?ts=04281753&oat_content=url", "upx7cmu": "line://ti/p/@144uhrtx?oat_content=url&ts=05241839" };
export const LINE_JS = "<script>(function(){var R=" + JSON.stringify(LINE_ROUTES) + ",APP=" + JSON.stringify(LINE_APP) + ";var via='',uc='';"
  + "try{var q=new URLSearchParams(location.search);if((q.get('utm_source')||'').toLowerCase()==='meta'){sessionStorage.setItem('wg_via','meta');sessionStorage.setItem('wg_uc',q.get('utm_content')||'');}if(sessionStorage.getItem('wg_via')==='meta'){via='meta';uc=sessionStorage.getItem('wg_uc')||'';}}catch(e){var q2=new URLSearchParams(location.search);if((q2.get('utm_source')||'').toLowerCase()==='meta'){via='meta';uc=q2.get('utm_content')||'';}}"
  + "var to=via==='meta'?(uc==='A-manga'?R.manga_A:uc==='D-manga'?R.manga_D:(uc==='A'||uc==='D')?R.hp_ad:'')||'" + LINE_META + "':(/^\\/manga\\//.test(location.pathname)?R.manga_direct:'');"
  + "if(to)document.querySelectorAll('a[href*=\"" + LINE_DEFAULT + "\"]').forEach(function(a){a.href=/^https?:/.test(to)?to:a.href.replace('" + LINE_DEFAULT + "',to);});"
  + "var ua=navigator.userAgent||'',iosApp=/iPhone|iPad|iPod/.test(ua)&&/Instagram|FBAN|FBAV/.test(ua);"
  + "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var isLine=/lin\\.ee|line\\.me/.test(a.href),isForm=/docs\\.google\\.com\\/forms|forms\\.gle/.test(a.href);if(!isLine&&!isForm)return;var t=(a.textContent||'').replace(/\\s+/g,'').slice(0,30);"
  + "if(isLine){var sec=a.closest('section,header,nav,footer');var place=sec?(sec.id||sec.className||sec.tagName).toString().split(' ')[0]:'';var p={link_url:a.href,link_text:t,place:place,transport_type:'beacon'};if(via)p.via=via;if(window.gtag){gtag('event','line_click_cv',p);var ls=document.querySelectorAll('a[href*=\"lin.ee\"],a[href*=\"line.me\"]'),bi=Array.prototype.indexOf.call(ls,a)+1;gtag('event','line_click',{click_page:location.pathname,click_button:(place||'link')+'-'+bi,link_text:t,link_url:a.href,ad_content:uc||'(none)',via:via||'(none)',transport_type:'beacon'});}if(window.fbq)fbq('track','Contact',via?{content_name:t,content_category:via}:{content_name:t});}"
  + "if(window.fbq)fbq('track','Lead',{content_name:t,content_category:(isLine?'line':'form')+(via?'_'+via:'')});"
  + "var m=isLine&&iosApp&&a.href.match(/lin\\.ee\\/([A-Za-z0-9]+)/),app=m&&APP[m[1]];if(app){e.preventDefault();var back=a.href;setTimeout(function(){location.href=app;},150);setTimeout(function(){if(document.visibilityState==='visible')location.href=back;},2650);}},true);})();</script>";

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
    "LINEクリック計測（ページ・ボタンつき）": "'line_click'",
    "GTMのnoscript": "ns.html?id=" + GTM,
  };
  const bad = [];
  for (const [k, s] of Object.entries(once)) {
    const n = html.split(s).length - 1;
    if (n !== 1) bad.push(k + " が " + n + " 回");
  }
  return bad;
}
