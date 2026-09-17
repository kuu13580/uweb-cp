# ADR-0004: 検証は Standard Schema に委ね、スキーマは同梱しない

- Status: Accepted
- Date: 2026-09-18

## 背景

受信データは信用できないため検証が要る。一方でバリデータを同梱すると、
利用者が既に使っている zod/valibot と二重になり、バンドルサイズも増える。

## 決定

`Contract.validate` は [Standard Schema](https://standardschema.dev/) v1 のインターフェースだけを要求する。
ライブラリは `@standard-schema/spec`（型のみ）に依存し、実装は同梱しない。
LLM への指示用 `jsonSchema` は利用者が明示的に渡す（zod 4 の `z.toJSONSchema()` 等から生成してよい）。

## 理由

「LLM に渡す仕様」と「受信値の検証」は目的が違う。前者は説明のための文書、後者は実行時の関門であり、
自動導出で片方に寄せると説明が冗長になるか検証が緩くなる。

## 結果

- 依存は型パッケージ 1 つのみ。ランタイム依存ゼロ。
- `validate` 未指定でも動くが、その場合 `data` は `unknown` 相当として扱う。
