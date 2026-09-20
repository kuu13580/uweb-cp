# travel-pwa

µweb-cp の実機検証用 PWA。旅行の条件をチャット AI に送り、返ってきた日程表を構造化データとして取り込む。

`packages/core` のテストは happy-dom 上で動くため、**共有シート・クリップボード・Share Target・PWA インストールだけは本物のブラウザでしか確かめられない**。このアプリはそこを見るためにある。

## 動かす

```sh
pnpm install
vp run -r build                             # 先に packages/core を 1 度ビルドする
vp run -F @uweb-cp/example-travel-pwa dev   # → http://localhost:5173
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
3. **フェンスが剥がれても通る** — Claude のコピーボタンはコードフェンスを落とすことがある。`via=fenced` ではなく `via=sentinel-scan` と出れば、フェンス無しでも拾えている
4. **壊れた返信** — 封筒の無いテキストを貼る → `no-envelope`、契約に合わない `data` → `validation-failed` がログに出る

### モバイル (HTTPS 必須)

`navigator.share`・Service Worker・PWA インストールはいずれも secure context でしか動かない。LAN 越しの `http://192.168.x.x` では確かめられないので、HTTPS を用意する。

```sh
vp run -r build
vp run -F @uweb-cp/example-travel-pwa preview   # → http://localhost:4173
cloudflared tunnel --url http://localhost:4173  # → https://xxx.trycloudflare.com
```

（静的ホスティングに `dist/` を上げても同じ。サブパス配下に置く場合は `vite.config.ts` の `base` と `SHARE_TARGET.action` を揃えること）

5. **共有シート** — 「AI に送る」→ OS の共有シートが開く → AI アプリを選ぶ → `via=web-share`
6. **インストール** — ブラウザメニューからホーム画面に追加 → 再度開くと `PWA インストール済み: true`
7. **Share Target (Chromium のみ)** — AI アプリで返信を共有 → 共有先に「µweb-cp trip」が出る → 選ぶとアプリが起動して取り込まれる。`Share Target: installed` かつ `受信` に `share-target` が含まれていることが前提
8. **再読み込みで二重取り込みされない** — 7 の直後にリロードしても再取り込みされない（URL のクエリを消しているため）

iOS/Safari では 7 は動かない（Web Share Target 非対応）。そこは `paste` が土台である理由そのもの（[ADR-0003](../../docs/adr/0003-paste-is-the-baseline-inbound.md)）。

## 中身

| ファイル                 | 役割                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/contract.ts`        | zod ひとつから `jsonSchema`（AI への説明）と `validate`（受信の関門）を出す                     |
| `src/main.ts`            | `createExchange` に繋ぐだけ。フレームワーク無しの素の DOM                                       |
| `vite.config.ts`         | manifest を組み立てる。`share_target` は `shareTargetManifest()` から出すので受信実装とずれない |
| `scripts/make-icons.mjs` | インストール条件を満たすアイコンをその場で生成（画像をリポジトリに置かないため）                |
| `test/app.test.ts`       | happy-dom で起動 → 貼り付け → 描画までの煙テスト                                                |
