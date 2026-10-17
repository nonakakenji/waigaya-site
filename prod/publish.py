#!/usr/bin/env python3
"""わいが舎HP（sharehouse-waigaya.com）の公開ボタンの中身。GitHub Actions の「本番に公開」から呼ばれる。
   prod/out/ の中身を、本番の public_html の「決まった名前の場所」にだけ上書きする。

   使い方（hp）:
     python3 publish.py --mode check     → FTPにつながず、out/ の中身が許可リストに収まるかと中身の検査だけ
     python3 publish.py --mode dry-run   → FTPに読み取りだけでつないで、上げる一覧とサーバーとの差を出す
     python3 publish.py --mode upload    → 許可リストの場所にだけ上書き（STOR）する。削除はしない
   イベントページ:
     python3 publish.py --target event --slug <スラッグ> --mode check|dry-run|upload
     → リポジトリの event/pages/<スラッグ>/ の中身を、本番の event/<スラッグ>/ にだけ上書きする
   接続情報は環境変数（GitHub Secrets から渡す）: WAIGAYA_FTP_HOST / WAIGAYA_FTP_USER / WAIGAYA_FTP_PASSWORD
   値は画面にもログにも出さない。

   守ること（prod/README.md の「out/ の中身＝本番の public_html に置くもの」）
   - 書いてよいのは下の ALLOW_FILES と ALLOW_DIRS の中だけ。外のパスが1つでもあれば、何も送らずに止める
   - 削除・名前変更・権限変更（DELE・RMD・RNFR・RNTO・SITE）は、どのモードでも送らない
   - dry-run では、読み取りのコマンドしか送らない（下の READ_ONLY_CMDS 以外は送る前に止める）"""
import os, re, sys, argparse
from ftplib import FTP_TLS, error_perm

HERE = os.path.dirname(os.path.abspath(__file__))
EVENT_PAGES = os.path.join(os.path.dirname(HERE), "event", "pages")
REMOTE_ROOT = "/"  # このFTPアカウントのルート＝本番の public_html

# ---- 本番で触ってよいもの（名前で固定） ----
ALLOW_FILES = {"index.html", "kurashi/index.html", "LP40/index.html", "LP20/index.html", "sitemap-static.xml", "img/og.jpg"}
ALLOW_DIRS = {"img/800", "img/1600"}  # この直下のファイルだけ（さらに下の階層は不可）
IMG_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|jpeg|webp|png|avif)$")
# 念のため、触らないものも名前で持っておく（許可リストと重なったら設定ミスとして止める）
DENY_PREFIXES = ("assets/", "privacy/", "thanks/", "send.php", "_private/", "event/", ".htaccess", "robots.txt", "sitemap.xml", "_nuxt/")
# 上げる順番（README のとおり）：写真 → 旧ページ → sitemap → 最後にトップ
ORDER = ["img/", "kurashi/", "LP40/", "LP20/", "sitemap-static.xml", "index.html"]

READ_ONLY_CMDS = {"AUTH", "USER", "PASS", "PBSZ", "PROT", "PWD", "CWD", "TYPE", "PASV", "EPSV", "LIST", "NLST", "SIZE", "MDTM", "MLSD", "MLST", "FEAT", "SYST", "NOOP", "QUIT", "OPTS"}
NEVER_CMDS = {"DELE", "RMD", "XRMD", "RNFR", "RNTO", "SITE", "APPE", "STOU"}


# ---- イベントページ（target=event） ----
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
SEG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
EVENT_EXT = (".html", ".css", ".js", ".json", ".svg", ".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".ico", ".txt")  # .gif はメール用の動く画像（2026-10-17 司令塔OK）
EVENT_ORDER = ["img/", ".css", ".js", ".json", ".htaccess", "index.html"]  # 写真 → CSS等 → 最後にページ本体


def event_slugs():
    """書いてよいスラッグ＝リポジトリの event/pages/ にあるフォルダの名前だけ"""
    if not os.path.isdir(EVENT_PAGES):
        return set()
    return {d for d in os.listdir(EVENT_PAGES) if os.path.isdir(os.path.join(EVENT_PAGES, d)) and SLUG_RE.match(d)}


def event_allowed(slug, remote):
    """remote＝本番の public_html からのパス。event/<slug>/ の中の、決まった種類のファイルだけ"""
    base = "event/" + slug + "/"
    if not remote.startswith(base) or remote.startswith("/") or "\\" in remote:
        return False
    parts = remote[len(base):].split("/")
    if any(p in ("", ".", "..") for p in parts) or len(parts) > 3:
        return False
    if parts == [".htaccess"]:  # 目隠し用の .htaccess はページ直下だけ
        return True
    if len(parts) == 2 and parts[0] == "img" and SEG_RE.match(parts[1]) and parts[1].lower().endswith(".mp4"):
        return True  # 動画（告知リール）は img/ の直下だけ（2026-10-14 任せよう会のページに載せるため）
    return all(SEG_RE.match(p) for p in parts) and parts[-1].lower().endswith(EVENT_EXT)


def event_content_check(slug, out, files):
    """イベントページの止める条件：他のイベントの場所を指している・プレビューURL・{{・メール/電話"""
    fail = []
    for rel, _ in files:
        if not rel.endswith((".html", ".css", ".js", ".json")):
            continue
        txt = open(os.path.join(out, rel), encoding="utf-8").read()
        bad = []
        others = sorted({m for m in re.findall(r"/event/([^/\"'?#)\s]+)/", txt) if m != slug})
        if others: bad.append("他のイベントの場所を指している: " + ", ".join(others))
        if "{{" in txt: bad.append("{{")
        if re.search(r"waigaya-site-preview|workers\.dev|localhost", txt): bad.append("プレビュー/手元のURL")
        if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+", txt.replace("@import", "").replace("@media", "")): bad.append("メールアドレスらしきもの")
        if re.search(r"(?<![0-9])0[0-9]{1,4}-[0-9]{1,4}-[0-9]{3,4}(?![0-9])", txt): bad.append("電話番号らしきもの")
        if bad: fail.append(rel + ": " + " / ".join(bad))
    return fail


def allowed(rel):
    if rel.startswith(DENY_PREFIXES) or ".." in rel.split("/") or rel.startswith("/"):
        return False
    if rel in ALLOW_FILES:
        return True
    d, _, name = rel.rpartition("/")
    return d in ALLOW_DIRS and bool(IMG_NAME.match(name))


def local_files(out, order=ORDER):
    files = []
    for root, dirs, fs in os.walk(out):
        for fn in fs:
            if fn == ".DS_Store":
                continue
            lp = os.path.join(root, fn)
            files.append((os.path.relpath(lp, out).replace(os.sep, "/"), os.path.getsize(lp)))
    rank = lambda rel: next((i for i, p in enumerate(order) if rel == p or rel.startswith(p) or rel.endswith(p)), len(order))
    return sorted(files, key=lambda f: (rank(f[0]), f[0]))


def content_check(out, files):
    """README の「止める条件」を、上げる直前にもう一度見る（build-prod.mjs と同じ基準）"""
    fail = []
    for rel, _ in files:
        if not rel.endswith(".html"):
            continue
        html = open(os.path.join(out, rel), encoding="utf-8").read()
        bad = []
        if re.search(r"noindex", html, re.I): bad.append("noindex")
        if re.search(r"プレビュー|試作", html): bad.append("「プレビュー」「試作」")
        if "{{" in html: bad.append("{{")
        if "矛盾" in html: bad.append("「矛盾」")
        if re.search(r"許可待ち|確認中", html): bad.append("「許可待ち」「確認中」")
        if "data:," in html: bad.append("空のfavicon")
        for k in ("GTM-P6D9DCST", "G-LH7EEZMVNW", "1296465352381188", "line_click_cv", 'rel="canonical"', "og:image", 'name="description"'):
            if k not in html: bad.append(k + " が無い")
        if len(re.findall(r'href="https://lin\.ee/', html)) < 5: bad.append("lin.ee リンク不足")
        if re.search(r"waigaya-site-preview|workers\.dev", html): bad.append("プレビューのURL")
        if bad: fail.append(rel + ": " + " / ".join(bad))
    return fail


def connect(write_ok):
    host, user, pw = ((os.environ.get(k) or "").strip() for k in ("WAIGAYA_FTP_HOST", "WAIGAYA_FTP_USER", "WAIGAYA_FTP_PASSWORD"))
    if not (host and user and pw):
        sys.exit("FTPの接続情報（WAIGAYA_FTP_HOST / USER / PASSWORD）が環境変数に無い。中止")
    ftp = FTP_TLS(timeout=90)
    _put = ftp.putcmd  # sendcmd も voidcmd も最後はここを通る

    def guard(line):
        cmd = line.split(" ", 1)[0].upper()
        if cmd in NEVER_CMDS:
            raise SystemExit("送ってはいけないコマンドを止めた: " + cmd)
        if not write_ok and cmd not in READ_ONLY_CMDS:
            raise SystemExit("dry-run なので書き込み系コマンドを止めた: " + cmd)
        return _put(line)
    ftp.putcmd = guard
    ftp.connect(host, 21)
    ftp.login(user, pw)
    ftp.prot_p()
    ftp.cwd(REMOTE_ROOT)
    print("FTP接続OK（" + ("書き込みあり" if write_ok else "読み取りだけ") + "）")
    return ftp


def remote_sizes(ftp, dirs):
    """dirs の直下にあるファイルの {相対パス: サイズ}。無いディレクトリは空として扱う"""
    found = {}
    for d in dirs:
        try:
            ftp.cwd(REMOTE_ROOT + d if d else REMOTE_ROOT)
        except error_perm:
            continue
        lines = []
        ftp.retrlines("LIST -a", lines.append)
        for line in lines:
            parts = line.split(maxsplit=8)
            if len(parts) < 9 or line[0] != "-":
                continue
            found[(d + "/" if d else "") + parts[8]] = int(parts[4])
    ftp.cwd(REMOTE_ROOT)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["check", "dry-run", "upload"], default="dry-run")
    ap.add_argument("--out", default=None)
    ap.add_argument("--target", choices=["hp", "event"], default="hp")
    ap.add_argument("--slug", default="")
    a = ap.parse_args()

    for rel in ALLOW_FILES:
        assert not rel.startswith(DENY_PREFIXES), "許可リストと触らないものが重なっている: " + rel

    if a.target == "event":
        slug = a.slug.strip()
        if not SLUG_RE.match(slug):
            sys.exit("event_slug が空か、使えない文字が入っている（英小文字・数字・ハイフンだけ。..や/は不可）。中止")
        if slug not in event_slugs():
            sys.exit(f"event/pages/{slug}/ がリポジトリに無いので出せない（出せるのは: {', '.join(sorted(event_slugs())) or 'なし'}）。中止")
        out = a.out or os.path.join(EVENT_PAGES, slug)
        prefix = "event/" + slug + "/"
        is_ok = lambda r: event_allowed(slug, r)
        order = EVENT_ORDER
    else:
        out = a.out or os.path.join(HERE, "out")
        prefix = ""
        is_ok = allowed
        order = ORDER

    local = local_files(out, order)
    if not local:
        sys.exit(f"{out} が空。中止")
    # files は「本番での置き場所」で持つ。手元の場所は localpath[] で引く
    localpath = {prefix + r: os.path.join(out, r) for r, _ in local}
    files = [(prefix + r, s) for r, s in local]
    outside = [r for r, _ in files if not is_ok(r)]
    total = sum(s for _, s in files)
    print(f"上げる候補: {len(files)}ファイル / {total/1048576:.1f}MB / 許可リスト外: {len(outside)}件")
    if outside:
        print("許可リストの外に書こうとしているので止めた（何も送っていない）:")
        for r in outside: print("  外:", r)
        sys.exit(2)
    if a.target == "event":
        fail = event_content_check(slug, out, local)
        if not fail and a.mode == "upload" and re.search(r"data-waigaya-sample", open(os.path.join(out, "index.html"), encoding="utf-8").read() if os.path.exists(os.path.join(out, "index.html")) else ""):
            fail = ["index.html: 見本ページ（data-waigaya-sample）は upload できない"]
    else:
        fail = content_check(out, local)
    if fail:
        print("止める条件に当たったので止めた（何も送っていない）:")
        for f in fail: print("  ", f)
        sys.exit(3)
    print("中身の検査: OK（" + ("他イベントの場所・プレビューURL・{{・メール/電話" if a.target == "event" else "noindex・プレビュー/試作・{{・計測タグ 等") + "）")
    if a.mode == "check":
        for r, s in files: print(f"  {s:>9}  {r}")
        return

    dirs = sorted({r.rpartition("/")[0] for r, _ in files})
    ftp = connect(write_ok=(a.mode == "upload"))
    remote = remote_sizes(ftp, dirs)
    new = [(r, s) for r, s in files if r not in remote]
    diff = [(r, s) for r, s in files if r in remote and remote[r] != s]
    same = [(r, s) for r, s in files if r in remote and remote[r] == s]
    print(f"サーバーとの差: 新規 {len(new)} / サイズが違う {len(diff)} / 同じサイズ {len(same)}")
    for label, group in (("新規", new), ("差分", diff), ("同じ", same)):
        for r, s in group:
            print(f"  [{label}] {r}  手元 {s}" + (f" / サーバー {remote[r]}" if r in remote else ""))
    only_server = sorted(set(remote) - {r for r, _ in files})
    if only_server:
        print(f"サーバーにだけあるもの（消さない・参考）: {len(only_server)}件")
        for r in only_server: print("  [サーバーだけ]", r)

    if a.mode == "dry-run":
        ftp.quit()
        print("dry-run なので、ここで終わり（サーバーには何も書いていない）")
        return

    # ---- upload：許可リストの中だけ、上の順番で上書き。削除はしない ----
    have_dirs = set(dirs) & ({r.rpartition("/")[0] for r in remote} | {""})
    sent = 0
    for rel, size in files:
        assert is_ok(rel), rel  # 送る直前にもう一度
        d, _, name = rel.rpartition("/")
        if d and d not in have_dirs:
            ftp.cwd(REMOTE_ROOT)
            for part in d.split("/"):
                try: ftp.cwd(part)
                except error_perm: ftp.mkd(part); ftp.cwd(part)
            have_dirs.add(d)
        ftp.cwd(REMOTE_ROOT + d if d else REMOTE_ROOT)
        with open(localpath[rel], "rb") as fh:
            ftp.storbinary("STOR " + name, fh, blocksize=1024 * 256)
        sent += 1
        print(f"  上げた {rel}")
    ftp.quit()
    print(f"完了: {sent}ファイル（削除 0）")


if __name__ == "__main__":
    main()
