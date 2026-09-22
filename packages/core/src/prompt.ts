import { ENVELOPE_VERSION, FENCE_INFO, type RequestEnvelope } from './envelope'
import type { Contract } from './types'

/**
 * When the model should emit the envelope.
 *
 * *What* to ask for belongs in instruction, which is the integrator's domain. *When* the
 * envelope arrives is not: it decides how long the app keeps listening and how many turns the
 * rid has to survive, so the library owns it.
 */
export type EmitTiming = 'now' | 'on-approval'

/**
 * Where to send the user once the envelope is out.
 *
 * By then they are inside the AI app. Left alone, they may never realise they have to copy it
 * and come back, and the round trip stops there — so the model adds one line saying so.
 */
export interface ReturnTo {
  /** What the user calls the app on screen. */
  name: string
  /** Where to go back to, included so it can be tapped. */
  url?: string
}

export interface BuildPromptOptions<T> {
  contract: Contract<T>
  /** Current state the app hands over, such as half-filled form values. */
  context?: unknown
  /** The request the user wrote. Falls back to contract.description. */
  instruction?: string
  /** Correlation id used to match the reply. */
  rid: string
  /** How many examples to include at most. */
  maxExamples?: number
  /** Language of the scaffolding. Japanese only for values starting with `ja`; English otherwise. */
  locale?: string
  /**
   * `now` (default): emit the envelope straight away. For extraction or conversion, where
   * there is nothing to discuss.
   * `on-approval`: work the content out first, and emit only once the user approves.
   */
  emit?: EmitTiming
  /** Set this to have the model say "copy it, come back and paste it". */
  returnTo?: ReturnTo
}

export interface BuiltPrompt {
  /** The body handed to the chat app, as Markdown. */
  text: string
  /** The request envelope embedded in text. */
  request: RequestEnvelope
  /** Rough character count, for checking deep-link length limits. */
  length: number
  /**
   * With `emit: 'on-approval'`, the phrase the user says to the AI.
   * Read it from here so the app's own wording cannot drift from the prompt's.
   */
  approvalPhrase?: string
}

const DEFAULT_MAX_EXAMPLES = 2

/**
 * Assembles the request, the request envelope and the reply template into one Markdown body.
 *
 * All the library promises is that the answer comes back as structured data, so the
 * scaffolding stays at the minimum that buys — what to ask for is left to instruction.
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

/** A template, not real JSON. Shows that `data` is the only part to fill in. */
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
