# ADR-0003: 受信の土台は paste、Share Target は上乗せ

- Status: Accepted
- Date: 2026-09-18

## 背景

Web Share Target API は Chromium 系（Android Chrome / デスクトップ Chrome・Edge）でのみ実装され、
iOS/Safari・Firefox では使えない。さらに **PWA がインストール済み**でなければ共有先に現れない。
コンセプト上の主役は「スマホの AI アプリから共有」だが、それを前提にすると iOS 利用者が何もできない。

## 決定

受信経路を段階として扱う。

1. `paste` — ブラウザなら常に動く。**既定かつ必須**
2. `fileDrop` — デスクトップの補助
3. `shareTarget` — Chromium + インストール済みのときだけ有効化される上乗せ

`detectCapabilities()` で環境を判定し、`recommendTransports()` がこの順序を返す。

## 理由

`navigator.clipboard.readText()` はユーザー操作と権限の制約が強く、暗黙の読み取りに使えない。
`paste` イベントなら利用者の貼り付け操作そのものを拾えるため、権限も要らない。

ただし `readText()` 自体を捨てるわけではない。**購読ではなく引き取り**として、
利用者の操作の中からだけ呼べる形 (`Exchange.pull()` / `readClipboardText()`) で提供する。
paste イベントが飛んでこない環境の逃げ道になり、`detectCapabilities().clipboardRead` が
その可否を返す。いつ呼ぶか・ボタンを出すかは実装者の領分なので、既定の経路には入れない。

## 結果

- アプリ側 UI は「貼り付け先」を必ず用意する必要がある。
- Share Target 対応は PWA manifest への追記が前提。params 名のずれで無言に壊れるため、
  manifest 断片 (`shareTargetManifest()`) を受信実装と同じ場所から提供する。
