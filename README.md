# waigaya-site

シェアハウス わいが舎（https://sharehouse-waigaya.com/）の、公開しているページだけを置く箱です。
ここにあるものは、どれも本番で誰でも見られるものです。

## 中身
- `hp/src/index.html`：ホームページの本文（`{{ph slot="…"}}` の所に写真が入る）
- `photos/web/`：ホームページで使う写真（800px・1600px）と `photos.json`
- `event/pages/<スラッグ>/`：イベントページ（1ページ1フォルダ）。`sample/` は見本で、そのままでは公開できない
- `prod/`：本番用の書き出し（`build-prod.mjs`・`build-event.mjs`・`tracking.mjs`）と、本番に上げるしくみ（`publish.py`）
- `.github/workflows/publish.yml`：「本番に公開」のボタン

## 本番に出す
1. 直して main に上げる
2. Actions の「本番に公開」を dry-run で押す（サーバーとの差と、許可リスト外0件を見る）
   - `gh workflow run publish.yml -R nonakakenji/waigaya-site -f target=hp -f mode=dry-run`
   - イベント：`-f target=event -f event_slug=<スラッグ>`
3. 差に問題がなければ `-f mode=upload`

## 守ること
- 書いてよい場所は `prod/publish.py` の許可リストの中だけ。削除はしない
- 住人・お客さんの名前（ホームページで公開しているものを除く）、メール、電話、お金の実際の数字、パスワードは入れない
- 写真は位置情報（EXIF）を消してから入れる
- FTPの接続情報は Actions の secrets（`WAIGAYA_FTP_HOST`・`WAIGAYA_FTP_USER`・`WAIGAYA_FTP_PASSWORD`）にだけある
