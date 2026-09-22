import { detectCapabilities, recommendTransports } from './capabilities'
import { UcpError } from './errors'
import { type Extraction, parseResponse } from './extract'
import { buildPrompt, type EmitTiming, type ReturnTo } from './prompt'
import { createRid } from './rid'
import { createLocalStorageStore, type PendingStore } from './store'
import { readClipboardText } from './transports/inbound/clipboard'
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
  /** Left out, the order comes from detectCapabilities(). */
  outbound?: OutboundTransport[]
  inbound?: InboundTransport[]
  store?: PendingStore
  /** How long a pending request survives before it is discarded. Default 24h. */
  ttlMs?: number
  /** Passed straight through to buildPrompt. */
  locale?: string
  /** When the envelope should be emitted. Defaults to `now`. */
  emit?: EmitTiming
  /**
   * How to point the user back after the envelope.
   * The wording is visible to them, so whether to say anything at all — and what to call the
   * app — is the integrator's call. Left out, nothing is added.
   */
  returnTo?: ReturnTo
  /** Allow a bare JSON object to count as `data` when no envelope is found. */
  allowBareJson?: boolean
}

export interface SendInput {
  context?: unknown
  instruction?: string
}

export interface SendResult {
  rid: string
  /** The id of the OutboundTransport that actually delivered. */
  via: OutboundTransportId
  prompt: string
  /** With `emit: 'on-approval'`, the phrase the user says to the AI. */
  approvalPhrase?: string
}

/** Sending and receiving for one contract. In normal use this is the only surface you touch. */
export interface Exchange<T> {
  readonly contract: Contract<T>
  /**
   * The prompt text without sending it, for driving your own UI.
   * Each call mints a fresh rid but registers nothing as pending, so use send to actually send.
   */
  preview(input?: SendInput): string
  send(input?: SendInput): Promise<SendResult>
  /** Takes arbitrary text and turns it into validated data. */
  accept(text: string): Promise<Result<Extraction<T>>>
  /**
   * Reads the clipboard and imports it.
   * Call this from inside a user gesture, such as a button press; some environments prompt for
   * permission. Throws UcpError when the read fails, with `transport-aborted` for a refusal.
   */
  pull(): Promise<Result<Extraction<T>>>
  /** Subscribes to the inbound transports. Returns the unsubscribe function. */
  listen(onResult: (result: Result<Extraction<T>>) => void): () => void
}

export function createExchange<T>(options: ExchangeOptions<T>): Exchange<T> {
  const { contract, ttlMs = DEFAULT_TTL_MS, locale, emit, returnTo, allowBareJson } = options
  const store = options.store ?? createLocalStorageStore()

  const prompt = (rid: string, input: SendInput | undefined) =>
    buildPrompt({
      contract,
      rid,
      ...(locale === undefined ? {} : { locale }),
      ...(emit === undefined ? {} : { emit }),
      ...(returnTo === undefined ? {} : { returnTo }),
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

      // Delivery can navigate the page away, so register as pending before delivering
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

    async pull() {
      return this.accept(await readClipboardText())
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
 * Tries the available transports in order.
 * When the user merely closed the share sheet, the next one is not tried — that would be
 * forcing the round trip on them.
 */
async function deliver(
  transports: readonly OutboundTransport[],
  text: string,
): Promise<OutboundTransportId> {
  const tried: string[] = []

  // Sequential is the point: once one succeeds the rest must not run, or the user sends twice
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
    tried.length > 0 ? `every transport failed: ${tried.join(', ')}` : 'no usable transport',
  )
}

const OUTBOUND_FACTORIES: Record<OutboundTransportId, () => OutboundTransport[]> = {
  'web-share': () => [webShareTransport()],
  clipboard: () => [clipboardTransport()],
  download: () => [downloadTransport()],
  // Needs a target template, so it cannot be built by default
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
