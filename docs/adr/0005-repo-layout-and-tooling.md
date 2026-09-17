# ADR-0005: リポジトリ構成とツールチェイン

- Status: Accepted
- Date: 2026-09-18

## 決定

**構成**: `uweb-cp/main/` を git リポジトリとし、親ディレクトリ `uweb-cp/` は git 管理外の worktree 置き場にする。
並行作業は `uweb-cp/<name>` に worktree を切る。

**ワークスペース**: pnpm workspace。`packages/core`（npm 名 `uweb-cp`）+ `examples/*`。
デモ PWA は Share Target 検証のために独立したアプリである必要があるため、初手からモノレポにする。

**ツール**:

| 用途        | 採用               | 理由                                                          |
| ----------- | ------------------ | ------------------------------------------------------------- |
| ビルド      | tsdown             | ESM 前提のブラウザ向けライブラリに合う。tsup は開発が停滞気味 |
| テスト      | vitest + happy-dom | 抽出器と Transport の大半を実機なしで回せる                   |
| Lint/Format | Biome              | ESLint + Prettier を 1 つに畳む                               |
| リリース    | changesets         |                                                               |

## 結果

- 既定ブランチ `main` とディレクトリ名 `main` が一致し、worktree 側のパスが用途名になる。
- ブラウザ実機でしか確認できない部分（共有シート、Share Target）は examples 側の責務になる。
