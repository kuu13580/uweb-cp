# demo

µweb-cp の公開デモ兼、実機検証用 PWA。お題をチャット AI に送り、列挙してもらったアイデアを構造化データとして取り込む。
プロジェクトの表紙（GitHub Pages）も兼ねていて、本文は root の README.md から生成している。

`packages/core` のテストは happy-dom 上で動くため、**共有シート・クリップボード・Share Target・PWA インストールだけは本物のブラウザでしか確かめられない**。このアプリはそこを見るためにある。

## 動かす

```sh
pnpm install
vp run -r build                             # 先に packages/core を 1 度ビルドする
vp run -F @uweb-cp/demo dev   # → http://localhost:5173
```

先にビルドが要るのは、`vite.config.ts` が `uweb-cp/transports` から manifest を組み立てるため。

画面上部に、その端末で何が使えるかが出る。ここが検証の主役。

```
navigator.share        true
clipboard.writeText    true
paste イベント          true
PWA インストール済み     false
Share Target           installable
送信の優先順            web-share → clipboard → download
受信                   paste, file-drop
```

## 確かめること

### デスクトップ (http://localhost でよい)

1. **送信** — 「AI に送る」→ `via=clipboard` とログに出る → チャット AI に貼り付ける
2. **受信** — AI の返信をコピーし、この画面のどこかに貼り付ける → 日程表が描画される
   - 反応しなければ textarea に貼って「貼り付けた内容を取り込む」
   - 「クリップボードから取り込む」は `readText()` 経由の引き取り。押した時点で権限確認が出ることがある
     （`clipboardRead` が false の端末ではボタン自体が出ない）
3. **フェンスが剥がれても通る** — Claude のコピーボタンはコードフェンスを落とすことがある。`via=fenced` ではなく `via=sentinel-scan` と出れば、フェンス無しでも拾えている
4. **壊れた返信** — 封筒の無いテキストを貼る → `no-envelope`、契約に合わない `data` → `validation-failed` がログに出る
5. **封筒を出す時機** — 「封筒を出させる時機」を切り替えて、AI の振る舞いが変わるか見る
   - `now`（既定）: その場で封筒を出す
   - `on-approval`: いきなり JSON を出さず、内容を詰めてから「確定」と送ると封筒が出る

### モバイル (HTTPS 必須)

`navigator.share`・Service Worker・PWA インストールはいずれも secure context でしか動かない。LAN 越しの `http://192.168.x.x` では確かめられないので、HTTPS のトンネルを張る。

```sh
pnpm run tunnel    # ビルド → preview → HTTPS トンネル → URL と QR を表示
```

QR をスマホで読めばそのまま開く。`cloudflared` が要るので、無ければ一度だけ:

```sh
curl -fsSL -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
```

> **URL は起動のたびに変わる。**オリジンが変わると、インストール済み PWA も Share Target の登録も無効になる。
> 8・9 を繰り返し試すなら、固定 URL の GitHub Pages 版を使うほうが早い。

サブパス配下に配信する場合は `UWEB_CP_BASE` を渡す。`base` / `start_url` / `scope` /
`share_target.action` / Service Worker の登録先がまとめて追従する。

```sh
UWEB_CP_BASE=/uweb-cp/ vp run -r build
```

トンネル越しの Host は Vite が既定で 403 にするため、`vite.config.ts` の `allowedHosts` で検証用ドメインだけ通してある。

6. **共有シート** — 「AI に送る」→ OS の共有シートが開く → AI アプリを選ぶ → `via=web-share`
7. **インストール** — ブラウザメニューからホーム画面に追加 → 再度開くと `PWA インストール済み: true`
8. **Share Target (Chromium のみ)** — AI アプリで返信を共有 → 共有先に「µweb-cp trip」が出る → 選ぶとアプリが起動して取り込まれる。`Share Target: installed` かつ `受信` に `share-target` が含まれていることが前提
9. **再読み込みで二重取り込みされない** — 8 の直後にリロードしても再取り込みされない（URL のクエリを消しているため）

iOS/Safari では 8 は動かない（Web Share Target 非対応）。そこは `paste` が土台である理由そのもの（[ADR-0003](../../docs/adr/0003-paste-is-the-baseline-inbound.md)）。

## 中身

| ファイル                 | 役割                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/contract.ts`        | zod ひとつから `jsonSchema`（AI への説明）と `validate`（受信の関門）を出す                     |
| `plugins/readme.ts`      | root の README.md をページ本文に変換し、マーカーの位置にデモを差し込む                          |
| `src/main.ts`            | `createExchange` に繋ぐだけ。フレームワーク無しの素の DOM                                       |
| `vite.config.ts`         | manifest を組み立てる。`share_target` は `shareTargetManifest()` から出すので受信実装とずれない |
| `scripts/make-icons.mjs` | インストール条件を満たすアイコンをその場で生成（画像をリポジトリに置かないため）                |
| `test/app.test.ts`       | happy-dom で起動 → 貼り付け → 描画までの煙テスト                                                |
| `scripts/tunnel.mjs`     | ビルド → preview → HTTPS トンネルを一息で立ち上げ、URL と QR を出す                             |
