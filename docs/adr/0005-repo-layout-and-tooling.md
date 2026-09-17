# ADR-0005: リポジトリ構成とツールチェイン

- Status: Accepted
- Date: 2026-09-18

## 決定

**構成**: `uweb-cp/main/` を git リポジトリとし、親ディレクトリ `uweb-cp/` は git 管理外の worktree 置き場にする。
並行作業は `uweb-cp/<name>` に worktree を切る。

**ワークスペース**: pnpm workspace。`packages/core`（npm 名 `uweb-cp`）+ `examples/*`。
デモ PWA は Share Target 検証のために独立したアプリである必要があるため、初手からモノレポにする。

**ツール**: [Vite+](https://viteplus.dev/)（`vite-plus`）に統合する。Vite / Rolldown / Vitest / tsdown / Oxlint / Oxfmt / Vite Task を 1 パッケージで束ねたもので、MIT。

| 用途               | 採用                | 備考                                                 |
| ------------------ | ------------------- | ---------------------------------------------------- |
| ビルド             | `vp pack`（tsdown） | ESM 前提のブラウザ向けライブラリに合う               |
| テスト             | `vp test`（Vitest） | 抽出器と Transport の大半を実機なしで回せる          |
| Lint / Format / 型 | `vp check`          | Oxlint + Oxfmt + tsgolint。型チェックまで 1 コマンド |
| パッケージ管理     | pnpm workspace      | catalog で Vite+ 系のバージョンを固定                |
| リリース           | changesets          |                                                      |

個別ツールを直接依存に持たない理由は、各ツールのバージョン整合を Vite+ 側が保証するため。
代償として Vitest などが数マイナー古いバージョンに固定される。

**設定の置き場所**: lint / format の設定は root の `vite.config.ts` の `lint` / `fmt` ブロックに置く。
Vite+ は `.oxlintrc.json` / `.oxfmtrc.json` を読まないため、これらのファイルは置かない（置くと黙って無視される）。

型認識 lint（`lint.options.typeAware` + `typeCheck`）を有効にしているので、`vp check` が型チェックを兼ねる。
CI から `tsc` の独立ステップを外している。

## 結果

- 既定ブランチ `main` とディレクトリ名 `main` が一致し、worktree 側のパスが用途名になる。
- ブラウザ実機でしか確認できない部分（共有シート、Share Target）は examples 側の責務になる。
- Vite+ は 0.x（ベータ）。破壊的変更に追従するコストを受け入れる前提での採用。
