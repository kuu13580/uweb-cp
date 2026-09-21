import { ENVELOPE_VERSION, FENCE_INFO, type RequestEnvelope } from './envelope'
import type { Contract } from './types'

/**
 * 封筒をいつ出させるか。
 *
 * 「何をさせたいか」は instruction (利用者の領分) だが、「いつ封筒が届くか」は
 * アプリが listen を張り続けるか・rid が何ターン生き残るかに直結するので、
 * ライブラリが面倒を見る。
 */
export type EmitTiming = 'now' | 'on-approval'

/**
 * 封筒を出したあと、利用者をどこへ戻すか。
 *
 * 封筒が出た時点で利用者は AI アプリの中にいる。放っておくと「コピーして戻る」に
 * 気づかず往復が途切れるため、本文に一言添えさせる。
 */
export interface ReturnTo {
  /** 利用者が画面上で認識しているアプリの呼び名。 */
  name: string
  /** 戻り先。タップで戻れるよう本文に添える。 */
  url?: string
}

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
  /**
   * `now` (既定): その場で封筒を出させる。抽出・変換のようにやり取りの余地が無い用途向け。
   * `on-approval`: まず内容を詰めさせ、利用者が承認して初めて封筒を出させる。
   */
  emit?: EmitTiming
  /** 指定すると「コピーして戻って貼り付けて」と案内させる。 */
  returnTo?: ReturnTo
}

export interface BuiltPrompt {
  /** チャットアプリへ渡す本文 (Markdown)。 */
  text: string
  /** text に埋め込んだ要求封筒。 */
  request: RequestEnvelope
  /** 概算文字数。ディープリンクの上限判定に使う。 */
  length: number
  /**
   * `emit: 'on-approval'` のとき、利用者が AI に言うべき合図。
   * アプリの案内文と本文がずれないよう、ここから受け取る。
   */
  approvalPhrase?: string
}

const DEFAULT_MAX_EXAMPLES = 2

/**
 * 依頼文・要求封筒・応答テンプレートを 1 本の Markdown に組み立てる。
 *
 * ライブラリが引き受けるのは「構造化データとして受け取れること」だけなので、
 * 足場はそのための最小限に留め、何をさせたいかは instruction に委ねる。
 */
export function buildPrompt<T>(options: BuildPromptOptions<T>): BuiltPrompt {
  const {
    contract,
    context,
    rid,
    instruction,
    emit = 'now',
    returnTo,
    maxExamples = DEFAULT_MAX_EXAMPLES,
  } = options
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
  sections.push(
    `${t.output[emit]}\n\n${fence(responseTemplate(rid, contract.ref, t.dataPlaceholder))}`,
  )
  const rules = [...t.rules[emit]]
  if (returnTo) rules.push(t.handBack(returnTo))
  sections.push(rules.map((rule) => `- ${rule}`).join('\n'))

  const examples = contract.examples?.slice(0, maxExamples) ?? []
  if (examples.length > 0) {
    const shown = examples.map((e) => fence(JSON.stringify(e, null, 2), 'json')).join('\n\n')
    sections.push(`${t.examples}\n\n${shown}`)
  }

  const text = sections.join('\n\n')
  return {
    text,
    request,
    length: text.length,
    ...(emit === 'on-approval' ? { approvalPhrase: t.approval } : {}),
  }
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
  output: Record<EmitTiming, string>
  rules: Record<EmitTiming, readonly string[]>
  examples: string
  dataPlaceholder: string
  approval: string
  handBack: (to: ReturnTo) => string
}

const EN_SHARED = [
  'Make `data` conform to the `schema` in the request above.',
  'Surrounding prose is fine, but include the envelope verbatim as JSON.',
]

const EN: Strings = {
  request: 'Machine-readable request:',
  output: {
    now: 'Reply with exactly one envelope in this shape:',
    'on-approval':
      'Once I approve — and not before — reply with exactly one envelope in this shape:',
  },
  rules: {
    now: ['Copy `rid` and `contract` unchanged.', ...EN_SHARED],
    'on-approval': [
      'First work the content out with me, asking questions where it helps. Do not output the envelope yet.',
      'Output the envelope only after I reply "approved", and only once.',
      'Copy `rid` and `contract` unchanged, however many turns later that is.',
      ...EN_SHARED,
    ],
  },
  examples: 'Examples of valid `data`:',
  dataPlaceholder: '<the result, conforming to schema>',
  approval: 'approved',
  handBack: (to) =>
    `Right after the envelope, add one short line telling me to copy it and go back to ${where(to)} to paste it.`,
}

const JA_SHARED = [
  '`data` は上の `schema` に従わせてください。',
  '前後に説明を書いても構いませんが、封筒は JSON のまま含めてください。',
]

const JA: Strings = {
  request: '機械可読の要求:',
  output: {
    now: '次の形の封筒をちょうど 1 つ返してください:',
    'on-approval': 'こちらが承認したら、そのときだけ次の形の封筒をちょうど 1 つ返してください:',
  },
  rules: {
    now: ['`rid` と `contract` はそのまま写してください。', ...JA_SHARED],
    'on-approval': [
      'まず内容を一緒に詰めてください。必要なら質問してください。この段階では封筒を出さないでください。',
      'こちらが「確定」と答えたら、そのときだけ封筒を 1 つ出してください。',
      '`rid` と `contract` は、何ターン後でもそのまま写してください。',
      ...JA_SHARED,
    ],
  },
  examples: '`data` の例:',
  dataPlaceholder: '<schema に従う結果>',
  approval: '確定',
  handBack: (to) =>
    `封筒の直後に「コピーして ${where(to)} に戻り、貼り付けてください」と 1 行添えてください。`,
}

function where(to: ReturnTo): string {
  return to.url === undefined ? to.name : `${to.name} (${to.url})`
}

function strings(locale?: string): Strings {
  return locale?.toLowerCase().startsWith('ja') ? JA : EN
}
