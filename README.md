# uweb-cp

[![CI](https://github.com/kuu13580/uweb-cp/actions/workflows/ci.yml/badge.svg)](https://github.com/kuu13580/uweb-cp/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-2a3a6e)](./LICENSE)
[![deps](https://img.shields.io/badge/runtime%20deps-0-2a3a6e)](./packages/core/package.json)

**µweb-cp — Micro Web Context Provider.** Web 標準だけで、アプリと「利用者が普段使っているチャット AI」の間を構造化データで往復させる TypeScript ライブラリ。

サーバも API キーも常駐プロセスも不要。運び手は利用者自身（共有シート / コピー&ペースト）。

## 試してみる

お題を AI に投げて**候補を列挙してもらい**、相談して決まったものを、
**検証済みの構造化データ**としてこの画面に取り込みます。
あなたのアプリが持っている「リスト」に置き換えて読んでください。

<!-- demo:start -->

→ **[ライブデモを開く](https://kuu13580.github.io/uweb-cp/)**（スマホでも動きます）

<!-- demo:end -->

## インストール

```sh
npm i uweb-cp
```

ランタイム依存はゼロ。検証だけ [Standard Schema](https://standardschema.dev/) 準拠のものを持ち込みます。

## 何を解決するか

![アプリからチャット AI へ依頼文と JSON Schema を送り、検証済みの構造化データを受け取る往復](./docs/roundtrip.svg)

列挙・下書き・洗い出しのような作業は、AI に任せたほうが速い。
けれど**結果はアプリの中で構造化データとして扱いたい**。

この 1 往復のためだけに MCP サーバやローカル LLM を立てるのは重すぎる。
利用者はすでに使い慣れた AI アプリを持っているのだから、
µweb-cp は **利用者を転送路として使う**ことで、インストール 0・設定 0 でこの往復を成立させる。

## 使用イメージ

```ts
import { createExchange, defineContract } from 'uweb-cp'

// 1. 受け取りたい形を宣言する
const ideaList = defineContract<IdeaList>({
  id: 'idea.list',
  description: 'お題について、具体的で重複のないアイデアを挙げてください。',
  jsonSchema,
  validate: ideaListSchema, // zod / valibot など Standard Schema 準拠なら何でも
})

// 2. 相談して決まってから封筒を出させる
const exchange = createExchange({ contract: ideaList, emit: 'on-approval' })

// 3. アプリ → AI（共有シートかクリップボード）
await exchange.send({ context: { topic: 'チーム内 Wiki に足す機能', count: 8 } })

// 4. AI → アプリ（貼り付け / Share Target / ドロップ）
exchange.listen((result) => {
  if (result.ok) addIdeas(result.value.envelope.data.ideas)
})
```

`addIdeas` はすでにあなたのアプリにある関数です。µweb-cp が引き受けるのは、
**その引数が検証済みの形で届くところまで**。

## 設計の軸## 設計の軸

|                          |                                                                      |
| ------------------------ | -------------------------------------------------------------------- |
| **転送路はテキストのみ** | チャット UI のコピー&ペーストを通過できるものしか使わない            |
| **人間がループに入る**   | API キー・CORS・サーバが要らない代わりに、送信ボタンを押すのは利用者 |
| **フレームワーク非依存** | Web API のみ。React/Vue/Svelte いずれからも使える                    |
| **検証は持ち込み**       | Standard Schema 準拠なら zod でも valibot でも arktype でも可        |

## スコープ外

- ローカル LLM（Ollama / llama.cpp 等）への直接中継 — 対象は**利用者の手元にある一般向けチャットアプリ**
- LLM の自律的なツール呼び出し — それは MCP の領分

## ドキュメント

- [アーキテクチャ](./docs/architecture.md) — 4 層構成と、設計の前提になっている環境制約
- [UCP-1 封筒フォーマット](./docs/protocol.md) — 往復フォーマットと探索規則
- [設計判断の記録 (ADR)](./docs/adr/) — なぜそうしたか

手を入れる人は [CONTRIBUTING](./CONTRIBUTING.md)。

## ライセンス

MIT
