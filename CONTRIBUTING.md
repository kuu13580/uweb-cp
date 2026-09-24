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

## リリース

```sh
pnpm exec changeset            # 変更の粒度と bump を書く
pnpm exec changeset version    # version と CHANGELOG を更新
git commit -am "chore(release): uweb-cp <version>"
git tag uweb-cp@<version> && git push origin main uweb-cp@<version>
```

タグの push で [Release ワークフロー](./.github/workflows/release.yml) が走り、
**Trusted Publishing (OIDC) でステージに積む。npm のトークンは置かない。**

公開はここでは終わらない。npmjs.com の **Staged Packages** で中身を確認し、2FA を通して
承認した時点で公開される（`npm stage list` / `npm stage view <id>` / `npm stage approve <id>` でも可）。
**OIDC の資格情報では承認できない。**ワークフローが乗っ取られても、人が通さない限り世に出ない。

npm は bypass-2FA トークンでの直接 publish を 2027-01 に廃止し、新規の TOTP 登録も
停止している（2FA はパスキーのみ）。手元から出す場合は `npm publish` を対話的に叩いて
ブラウザでパスキー承認する必要がある。0.1.0 はその方法で出した。

> trusted publisher は npmjs.com のパッケージ設定で、リポジトリと**ワークフローのファイル名**を
> 指定して登録する。パッケージが存在しないと登録できないため、初回だけは手元から出すしかない。
> Allowed actions の「publish directly」は**外しておく**（ステージのみ）。

## リポジトリ構成

git リポジトリの実体は `uweb-cp/main/`。親ディレクトリ `uweb-cp/` は git 管理外の worktree 置き場で、
並行作業は `uweb-cp/<用途名>` に切る。

## 約束

- **設計判断は [ADR](./docs/adr/) に残す。** コードを読んでも分からない「Web の制約上そうせざるを得ない」判断が多いため
- **抽出器（`packages/core/src/extract.ts`）の変更は必ずテストを伴う。** 信頼性がここに集中している
- **ランタイム依存を増やさない。** `@standard-schema/spec` は型のみ
- **`window` / `navigator` を import 時点で触らない。** SSR でも読み込めること
- コミットは後から追える粒度に分ける。理由がコードから読み取れない変更は、なぜそうしたかを本文に書く
