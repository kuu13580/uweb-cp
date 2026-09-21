# 開発

ライブラリの使い方は [README](./README.md)。ここは手を入れる人向け。
エージェント向けの約束は [CLAUDE.md](./CLAUDE.md)。

## 前提

- Node 22 以上
- ツールチェインは [Vite+](https://viteplus.dev/) に統合してある（Vite / Rolldown / Vitest / tsdown / Oxlint / Oxfmt）

```sh
pnpm install
```

## コマンド

```sh
vp run -r build    # 全パッケージのビルド
vp check           # format + lint + 型チェック
vp check --fix     # 自動修正込み
vp test run        # テスト
```

- **`vp check` / `vp test` の前に `vp run -r build` が必要。** `examples/*` は `uweb-cp` を実際の利用者と同じく `dist` 経由で解決するため。CI も同じ順序
- **lint / format の設定は root の `vite.config.ts`。** Vite+ は `.oxlintrc.json` / `.oxfmtrc.json` を読まないので置かない
- 型認識 lint（`typeAware` + `typeCheck`）が有効なので、`vp check` が型チェックを兼ねる。`tsc` を別に走らせる必要はない
- `vp <name>` は組み込みコマンド、`vp run <name>` が package.json のスクリプト

## 実機検証

共有シート・クリップボード・Web Share Target・PWA インストールは happy-dom では確かめられない。
[examples/demo](./examples/demo) に検証用アプリと手順のチェックリストがある。

```sh
cd examples/demo
pnpm run tunnel    # ビルド → preview → HTTPS トンネル → URL と QR
```

固定 URL 版は <https://kuu13580.github.io/uweb-cp/>（`main` への push で自動更新）。

## リポジトリ構成

git リポジトリの実体は `uweb-cp/main/`。親ディレクトリ `uweb-cp/` は git 管理外の worktree 置き場で、
並行作業は `uweb-cp/<用途名>` に切る。

## 約束

- **設計判断は [ADR](./docs/adr/) に残す。** コードを読んでも分からない「Web の制約上そうせざるを得ない」判断が多いため
- **抽出器（`packages/core/src/extract.ts`）の変更は必ずテストを伴う。** 信頼性がここに集中している
- **ランタイム依存を増やさない。** `@standard-schema/spec` は型のみ
- **`window` / `navigator` を import 時点で触らない。** SSR でも読み込めること
- コミットは後から追える粒度に分ける。理由がコードから読み取れない変更は、なぜそうしたかを本文に書く
