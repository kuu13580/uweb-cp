import { ENVELOPE_VERSION, FENCE_INFO, type RequestEnvelope } from './envelope'
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
  /** 足場の言語。`ja` で始まる値のみ日本語、既定は英語。 */
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

const DEFAULT_MAX_EXAMPLES = 2

/**
 * 依頼文・要求封筒・応答テンプレートを 1 本の Markdown に組み立てる。
 *
 * ライブラリが引き受けるのは「構造化データとして受け取れること」だけなので、
 * 足場はそのための最小限に留め、何をさせたいかは instruction に委ねる。
 */
export function buildPrompt<T>(options: BuildPromptOptions<T>): BuiltPrompt {
  const { contract, context, rid, instruction, maxExamples = DEFAULT_MAX_EXAMPLES } = options
  const t = strings(options.locale)

  const request: RequestEnvelope = {
    ucp: ENVELOPE_VERSION,
    kind: 'request',
    rid,
    contract: contract.ref,
    schema: contract.jsonSchema,
    ...(context === undefined ? {} : { context }),
  }

  const sections: string[] = []
  const lead = instruction ?? contract.description
  if (lead) sections.push(lead)

  sections.push(`${t.request}\n\n${fence(JSON.stringify(request, null, 2))}`)
  sections.push(`${t.output}\n\n${fence(responseTemplate(rid, contract.ref, t.dataPlaceholder))}`)
  sections.push(t.rules.map((rule) => `- ${rule}`).join('\n'))

  const examples = contract.examples?.slice(0, maxExamples) ?? []
  if (examples.length > 0) {
    const shown = examples.map((e) => fence(JSON.stringify(e, null, 2), 'json')).join('\n\n')
    sections.push(`${t.examples}\n\n${shown}`)
  }

  const text = sections.join('\n\n')
  return { text, request, length: text.length }
}

function fence(body: string, info: string = FENCE_INFO): string {
  return `\`\`\`${info}\n${body}\n\`\`\``
}

/** 実 JSON ではなく雛形。data だけが差し替え箇所であることを見せる。 */
function responseTemplate(rid: string, contract: string, placeholder: string): string {
  return [
    '{',
    `  "ucp": ${ENVELOPE_VERSION},`,
    '  "kind": "response",',
    `  "rid": ${JSON.stringify(rid)},`,
    `  "contract": ${JSON.stringify(contract)},`,
    `  "data": ${placeholder}`,
    '}',
  ].join('\n')
}

interface Strings {
  request: string
  output: string
  rules: readonly string[]
  examples: string
  dataPlaceholder: string
}

const EN: Strings = {
  request: 'Machine-readable request:',
  output: 'Reply with exactly one envelope in this shape:',
  rules: [
    'Copy `rid` and `contract` unchanged.',
    'Make `data` conform to the `schema` in the request above.',
    'Surrounding prose is fine, but include the envelope verbatim as JSON.',
  ],
  examples: 'Examples of valid `data`:',
  dataPlaceholder: '<the result, conforming to schema>',
}

const JA: Strings = {
  request: '機械可読の要求:',
  output: '次の形の封筒をちょうど 1 つ返してください:',
  rules: [
    '`rid` と `contract` はそのまま写してください。',
    '`data` は上の `schema` に従わせてください。',
    '前後に説明を書いても構いませんが、封筒は JSON のまま含めてください。',
  ],
  examples: '`data` の例:',
  dataPlaceholder: '<schema に従う結果>',
}

function strings(locale?: string): Strings {
  return locale?.toLowerCase().startsWith('ja') ? JA : EN
}
