import type { RequestEnvelope } from './envelope'
import type { Contract } from './types'

export interface BuildPromptOptions<T> {
  contract: Contract<T>
  /** アプリ側が渡す現在の文脈 (フォームの入力途中の値など)。 */
  context?: unknown
  /** 利用者が書いた依頼文。省略時は contract.description を使う。 */
  instruction?: string
  /** 応答の突き合わせに使う相関 ID。 */
  rid: string
  /** 出力に含める例の最大数。 */
  maxExamples?: number
  locale?: string
}

export interface BuiltPrompt {
  /** チャットアプリへ渡す本文 (Markdown)。 */
  text: string
  /** text に埋め込んだ要求封筒。 */
  request: RequestEnvelope
  /** 概算文字数。ディープリンクの上限判定に使う。 */
  length: number
}

/** TODO: 実装。依頼文 + JSON Schema + 応答封筒テンプレートを組み立てる。 */
export function buildPrompt<T>(_options: BuildPromptOptions<T>): BuiltPrompt {
  throw new Error('not implemented')
}
