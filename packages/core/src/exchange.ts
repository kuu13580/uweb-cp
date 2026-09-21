import { detectCapabilities, recommendTransports } from './capabilities'
import { UcpError } from './errors'
import { type Extraction, parseResponse } from './extract'
import { buildPrompt, type EmitTiming } from './prompt'
import { createRid } from './rid'
import { createLocalStorageStore, type PendingStore } from './store'
import { fileDropTransport } from './transports/inbound/file-drop'
import { pasteTransport } from './transports/inbound/paste'
import { shareTargetTransport } from './transports/inbound/share-target'
import { clipboardTransport } from './transports/outbound/clipboard'
import { downloadTransport } from './transports/outbound/download'
import { webShareTransport } from './transports/outbound/web-share'
import type {
  InboundTransport,
  InboundTransportId,
  OutboundTransport,
  OutboundTransportId,
} from './transports/types'
import type { Contract, Result } from './types'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export interface ExchangeOptions<T> {
  contract: Contract<T>
  /** 未指定なら detectCapabilities() から推奨順に選ぶ。 */
  outbound?: OutboundTransport[]
  inbound?: InboundTransport[]
  store?: PendingStore
  /** 応答待ちの要求を破棄するまでの時間。既定 24h。 */
  ttlMs?: number
  /** buildPrompt へそのまま渡す。 */
  locale?: string
  /** 封筒を出させる時機。既定は `now`。 */
  emit?: EmitTiming
  /** 封筒が見つからないとき、素の JSON を data とみなすことを許す。 */
  allowBareJson?: boolean
}

export interface SendInput {
  context?: unknown
  instruction?: string
}

export interface SendResult {
  rid: string
  /** 実際に使われた OutboundTransport の id。 */
  via: OutboundTransportId
  prompt: string
  /** `emit: 'on-approval'` のとき、利用者が AI に言うべき合図。 */
  approvalPhrase?: string
}

/** 1 契約に対する送受信のまとまり。ライブラリ利用者が普段触るのはこれだけ。 */
export interface Exchange<T> {
  readonly contract: Contract<T>
  /**
   * 送信せずプロンプト文字列だけ得る (自前 UI 用)。
   * 毎回新しい rid を振るだけで応答待ちには登録しないので、実際に送るなら send を使う。
   */
  preview(input?: SendInput): string
  send(input?: SendInput): Promise<SendResult>
  /** 任意のテキストを受け取って検証済みデータにする。 */
  accept(text: string): Promise<Result<Extraction<T>>>
  /** inbound transport を購読する。解除関数を返す。 */
  listen(onResult: (result: Result<Extraction<T>>) => void): () => void
}

export function createExchange<T>(options: ExchangeOptions<T>): Exchange<T> {
  const { contract, ttlMs = DEFAULT_TTL_MS, locale, emit, allowBareJson } = options
  const store = options.store ?? createLocalStorageStore()

  const prompt = (rid: string, input: SendInput | undefined) =>
    buildPrompt({
      contract,
      rid,
      ...(locale === undefined ? {} : { locale }),
      ...(emit === undefined ? {} : { emit }),
      ...(input?.context === undefined ? {} : { context: input.context }),
      ...(input?.instruction === undefined ? {} : { instruction: input.instruction }),
    })

  return {
    contract,

    preview(input) {
      return prompt(createRid(), input).text
    },

    async send(input) {
      await store.prune(ttlMs)

      const rid = createRid()
      const built = prompt(rid, input)
      const transports = options.outbound ?? defaultOutbound()

      // 送信の途中で画面が離れることがあるので、配送前に応答待ちへ登録する
      await store.put({
        rid,
        contract: contract.ref,
        createdAt: Date.now(),
        ...(input?.context === undefined ? {} : { context: input.context }),
      })

      try {
        const via = await deliver(transports, built.text)
        return {
          rid,
          via,
          prompt: built.text,
          ...(built.approvalPhrase === undefined ? {} : { approvalPhrase: built.approvalPhrase }),
        }
      } catch (error) {
        await store.take(rid)
        throw error
      }
    },

    async accept(text) {
      const pending = await store.latest(contract.ref)
      const result = await parseResponse<T>(text, {
        contract,
        ...(pending === undefined ? {} : { rid: pending.rid }),
        ...(allowBareJson === undefined ? {} : { allowBareJson }),
      })

      if (result.ok) {
        const rid = result.value.envelope.rid ?? pending?.rid
        if (rid !== undefined) await store.take(rid)
      }
      return result
    },

    listen(onResult) {
      const transports = options.inbound ?? defaultInbound()
      const disposers = transports.map((transport) =>
        transport.start((text) => {
          void this.accept(text).then(onResult)
        }),
      )
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
  }
}

/**
 * 使える経路を上から順に試す。
 * 利用者が共有シートを閉じただけのときは次を試さない — 押し付けになるため。
 */
async function deliver(
  transports: readonly OutboundTransport[],
  text: string,
): Promise<OutboundTransportId> {
  const tried: string[] = []

  // 逐次でなければ意味がない: 1 つ成功したら後続は送らない (並列化すると多重送信になる)
  for (const transport of transports) {
    // oxlint-disable-next-line no-await-in-loop
    if (!(await transport.isAvailable())) continue

    try {
      // oxlint-disable-next-line no-await-in-loop
      await transport.deliver({ text })
      return transport.id
    } catch (error) {
      if (error instanceof UcpError && error.code === 'transport-aborted') throw error
      tried.push(transport.id)
    }
  }

  throw new UcpError(
    'transport-unavailable',
    tried.length > 0 ? `送信経路が全て失敗した: ${tried.join(', ')}` : '使える送信経路が無い',
  )
}

const OUTBOUND_FACTORIES: Record<OutboundTransportId, () => OutboundTransport[]> = {
  'web-share': () => [webShareTransport()],
  clipboard: () => [clipboardTransport()],
  download: () => [downloadTransport()],
  // 宛先テンプレートが要るので既定では組み立てられない
  'deep-link': () => [],
}

const INBOUND_FACTORIES: Record<InboundTransportId, () => InboundTransport[]> = {
  paste: () => [pasteTransport()],
  'file-drop': () =>
    typeof globalThis.document === 'undefined' ? [] : [fileDropTransport(globalThis.document)],
  'share-target': () => [shareTargetTransport()],
}

function defaultOutbound(): OutboundTransport[] {
  return recommendTransports(detectCapabilities()).outbound.flatMap((id) =>
    OUTBOUND_FACTORIES[id](),
  )
}

function defaultInbound(): InboundTransport[] {
  return recommendTransports(detectCapabilities()).inbound.flatMap((id) => INBOUND_FACTORIES[id]())
}
