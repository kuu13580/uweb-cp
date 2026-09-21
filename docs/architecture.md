# アーキテクチャ

## 全体像

4 層。上の層ほどアプリに近く、下の層ほど環境差分を吸収する。

```
┌──────────────────────────────────────────────┐
│ Exchange    createExchange / send / listen   │  アプリが触るのはここだけ
├──────────────────────────────────────────────┤
│ Contract    defineContract  (何を受け取るか)  │
│ Prompt      buildPrompt     (どう依頼するか)  │
│ Extract     parseResponse   (どう取り出すか)  │
├──────────────────────────────────────────────┤
│ Envelope    UCP-1 封筒 (往復の共通フォーマット) │
├──────────────────────────────────────────────┤
│ Transport   outbound / inbound (環境差分)      │
└──────────────────────────────────────────────┘
        ┊ 横断: Capabilities (何が使えるか) / PendingStore (往復の状態)
```

## 各層の責務

### Contract

アプリが受け取りたいデータの定義。`jsonSchema` は **LLM への指示用**、`validate` (Standard Schema) は **受信データの検証用**で、
役割が違うため意図的に別フィールドにしている。zod 4 のように両方を出せるライブラリなら片方から導出してよい。

### Prompt

依頼文・JSON Schema・応答封筒テンプレート・相関 ID (`rid`) を 1 本の Markdown に組み立てる。
長さを返すのは、ディープリンクの URL 長上限を送信前に判定するため。

封筒が出た時点で利用者は AI アプリの中にいるので、「コピーして戻って貼り付けて」と案内させる 1 行を添える
（`returnTo`）。これが無いと往復がそこで途切れる。戻り先はアプリ側の画面から推定するので、既定で何も設定しなくてよい。

### Extract

**ここが信頼性の本体**。LLM の返信テキストから応答封筒を取り出す。

チャット UI のコピー経路ではコードフェンスが失われることがあり、共有シート経由の文字列も素のテキストになる。
そのため **コードフェンスは手がかりに過ぎず**、主経路はセンチネルキー `"ucp"` の探索 + 括弧の対応走査とする。
前後に地の文があっても、複数の封筒が含まれていても動くこと。

外部環境なしで単体テストできる唯一の層なので、テストはここに集中させる。

### Envelope

往復の共通フォーマット。詳細は [protocol.md](./protocol.md)。

### Transport

`OutboundTransport` / `InboundTransport` の 2 インターフェースに閉じる。
アプリ側は「どの経路で運ばれたか」を知らなくてよい。

| 方向 | 実装          | 位置づけ                                           |
| ---- | ------------- | -------------------------------------------------- |
| out  | `clipboard`   | デスクトップの主経路                               |
| out  | `webShare`    | モバイルの主経路 (`navigator.share`)               |
| out  | `deepLink`    | ベストエフォート。各社の URL 仕様は非公開で変わる  |
| out  | `download`    | 最終手段 (.md 保存)                                |
| in   | `paste`       | **全環境で動く唯一の経路。既定**                   |
| in   | `shareTarget` | Chromium + インストール済み PWA のときだけの上乗せ |
| in   | `fileDrop`    | デスクトップの補助                                 |

### Capabilities

環境で何が使えるかを列挙し、`recommendTransports()` が**推奨順のフォールバック列**を返す。
受信は `paste` を必ず先頭に含め、`shareTarget` はインストール済み Chromium のときだけ上乗せする。

### PendingStore

送信済み・応答待ちの要求を `rid` で保持する。
Web Share Target は**新規ナビゲーション**でアプリを開くため `sessionStorage` では消える。既定は `localStorage`。

## 環境制約（設計前提）

- **Web Share Target は Chromium 系のみ**。iOS/Safari・Firefox では使えない。したがって受信の土台は `paste` であり、`shareTarget` は上乗せ機能に留める。
- **Share Target はインストール済み PWA が前提**。未インストール時に無言で失敗しないこと。
- **ディープリンクの URL 長には上限がある**（十数 KB 程度）。プロンプトが超える場合はクリップボード/共有へ落とす。
- **`rid` の往復は保証されない**。LLM が相関 ID を落とす前提で、契約 ID 一致 + 直近の要求へのフォールバックを持つ。
- **`navigator.clipboard.readText()` は権限とユーザー操作の制約が強い**。読み取りは `paste` イベントを優先する。

## リポジトリ構成

```
uweb-cp/                 ← git 管理外。worktree の置き場
└── main/                ← 既定ワークツリー (git リポジトリ)
    ├── packages/core/   ← npm パッケージ `uweb-cp`
    ├── examples/        ← デモ (旅行日程 PWA を予定)
    └── docs/
```

並行作業は `wt new` で `uweb-cp/<name>` に worktree を切る。
