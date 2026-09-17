# uweb-cp

Web 標準のみでアプリ⇄チャット AI 間の構造化データ往復を成立させる TypeScript ライブラリ。

## まず読む

- [docs/architecture.md](./docs/architecture.md) — 4 層構成と環境制約
- [docs/protocol.md](./docs/protocol.md) — UCP-1 封筒フォーマット
- [docs/adr/](./docs/adr/) — 設計判断と理由

## 構成

- リポジトリ実体は `uweb-cp/main/`。親 `uweb-cp/` は worktree 置き場（git 管理外）
- `packages/core` = npm パッケージ `uweb-cp`。`examples/*` は実機検証用

## 実装時の約束

- **ランタイム依存を増やさない**。`@standard-schema/spec` は型のみ
- **`window` / `navigator` を import 時点で触らない**。SSR でも読み込めること
- Transport は `OutboundTransport` / `InboundTransport` の形に従い、上位層に環境差分を漏らさない
- 抽出器 (`src/extract.ts`) の変更は必ずテストを伴う。信頼性がここに集中している

## コマンド

```sh
pnpm check      # format:check + lint + typecheck + test (CI と同じ)
pnpm build      # tsdown
pnpm test       # vitest
pnpm lint       # oxlint
pnpm format     # oxfmt (import 順の整列も担当)
```
