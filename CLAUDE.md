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

ツールチェインは [Vite+](https://viteplus.dev/) に統合済み。Vitest / Oxlint / Oxfmt / tsdown を個別に入れず、`vite-plus` 1 つから使う。

```sh
vp install         # 依存導入 (pnpm も併用可)
vp check           # format + lint + 型チェックを一括
vp check --fix     # 自動修正込み
vp test run        # テスト
vp run -r build    # 全パッケージのビルド (vp pack)
```

- **lint / format の設定は root の `vite.config.ts`** に集約されている。`.oxlintrc.json` / `.oxfmtrc.json` は読まれないので置かない
- `lint.options.typeAware` + `typeCheck` を有効にしているので、`vp check` が型チェックまで行う。別途 `tsc` を走らせる必要はない
- **`vp check` / `vp test` の前に `vp run -r build` が必要**。`examples/*` は `uweb-cp` を実際の利用者と同じく `dist` 経由で解決するため
- `vp <name>` は組み込みコマンド、`vp run <name>` が package.json スクリプト
