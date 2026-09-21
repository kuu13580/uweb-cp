import { describe, expect, it, vi } from 'vite-plus/test'
import { defineContract } from '../src/contract'
import { UcpError } from '../src/errors'
import { createExchange } from '../src/exchange'
import { createMemoryStore, type PendingStore } from '../src/store'
import type {
  InboundHandler,
  InboundTransport,
  OutboundTransport,
  OutboundTransportId,
} from '../src/transports/types'

const trip = defineContract<{ days: number }>({
  id: 'trip.itinerary',
  jsonSchema: { type: 'object' },
})

const reply = (rid: string, days: number) =>
  `どうぞ\n${JSON.stringify({
    ucp: 1,
    kind: 'response',
    rid,
    contract: 'trip.itinerary@1',
    data: { days },
  })}`

/** deliver の結果を指図できる送信経路。 */
const fakeOutbound = (
  id: OutboundTransportId,
  behaviour: { available?: boolean; fail?: Error } = {},
): OutboundTransport & { sent: string[] } => {
  const sent: string[] = []
  return {
    id,
    sent,
    isAvailable: () => behaviour.available ?? true,
    deliver: (payload) => {
      if (behaviour.fail) return Promise.reject(behaviour.fail)
      sent.push(payload.text)
      return Promise.resolve()
    },
  }
}

/** 任意のタイミングでテキストを流し込める受信経路。 */
const fakeInbound = (): InboundTransport & {
  emit: (text: string) => void
  live: () => boolean
} => {
  let handler: InboundHandler | undefined
  return {
    id: 'paste',
    start(next) {
      handler = next
      return () => {
        handler = undefined
      }
    },
    emit: (text) => handler?.(text, { source: 'paste' }),
    live: () => handler !== undefined,
  }
}

const make = (overrides: Partial<Parameters<typeof createExchange>[0]> = {}) => {
  const store: PendingStore = createMemoryStore()
  return { store, exchange: createExchange({ contract: trip, store, ...overrides }) }
}

describe('send', () => {
  it('delivers through the first available transport', async () => {
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [clipboard] })

    const result = await exchange.send({ instruction: '金沢 2 泊で。' })

    expect(result.via).toBe('clipboard')
    expect(clipboard.sent[0]).toContain('金沢 2 泊で。')
    expect(result.prompt).toBe(clipboard.sent[0])
  })

  it('skips a transport that reports itself unavailable', async () => {
    const share = fakeOutbound('web-share', { available: false })
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [share, clipboard] })

    expect((await exchange.send()).via).toBe('clipboard')
  })

  it('falls through when a transport fails', async () => {
    const share = fakeOutbound('web-share', { fail: new Error('nope') })
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [share, clipboard] })

    expect((await exchange.send()).via).toBe('clipboard')
  })

  it('stops at an aborted share instead of pushing the next transport', async () => {
    const abort = new UcpError('transport-aborted', 'closed')
    const share = fakeOutbound('web-share', { fail: abort })
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [share, clipboard] })

    await expect(exchange.send()).rejects.toThrow(abort)
    expect(clipboard.sent).toEqual([])
  })

  it('records the pending request', async () => {
    const { exchange, store } = make({ outbound: [fakeOutbound('clipboard')] })

    const { rid } = await exchange.send({ context: { destination: '金沢' } })

    expect(await store.latest(trip.ref)).toMatchObject({ rid, context: { destination: '金沢' } })
  })

  it('drops the pending request when every transport fails', async () => {
    const { exchange, store } = make({
      outbound: [fakeOutbound('clipboard', { fail: new Error('nope') })],
    })

    await expect(exchange.send()).rejects.toThrow(UcpError)
    expect(await store.list()).toEqual([])
  })

  it('fails when there is no usable transport', async () => {
    const { exchange } = make({ outbound: [] })
    await expect(exchange.send()).rejects.toThrow(UcpError)
  })

  it('prunes expired requests', async () => {
    const { exchange, store } = make({ outbound: [fakeOutbound('clipboard')], ttlMs: 1000 })
    await store.put({ rid: 'stale', contract: trip.ref, createdAt: Date.now() - 10_000 })

    await exchange.send()

    expect((await store.list()).map((e) => e.rid)).not.toContain('stale')
  })
})

describe('emit mode', () => {
  it('passes the timing through to the prompt', async () => {
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [clipboard], emit: 'on-approval', locale: 'ja' })

    const result = await exchange.send()

    expect(result.approvalPhrase).toBe('確定')
    expect(clipboard.sent[0]).toContain('「確定」と答えたら')
  })

  it('mentions going back only when the app asks for it', async () => {
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({
      outbound: [clipboard],
      locale: 'ja',
      returnTo: { name: '旅程メモ' },
    })

    await exchange.send()

    expect(clipboard.sent[0]).toContain('コピーして 旅程メモ')
  })

  it('says nothing about going back by default', async () => {
    const clipboard = fakeOutbound('clipboard')
    const { exchange } = make({ outbound: [clipboard] })

    await exchange.send()

    expect(clipboard.sent[0]).not.toContain('go back to')
  })

  it('says nothing about approval by default', async () => {
    const { exchange } = make({ outbound: [fakeOutbound('clipboard')] })
    expect((await exchange.send()).approvalPhrase).toBeUndefined()
  })
})

describe('accept', () => {
  it('parses a reply and clears the pending request', async () => {
    const { exchange, store } = make({ outbound: [fakeOutbound('clipboard')] })
    const { rid } = await exchange.send()

    const result = await exchange.accept(reply(rid, 3))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 3 })
    expect(await store.list()).toEqual([])
  })

  it('prefers the envelope matching the pending rid', async () => {
    const { exchange } = make({ outbound: [fakeOutbound('clipboard')] })
    const { rid } = await exchange.send()

    const result = await exchange.accept(`${reply(rid, 1)}\n${reply('r_other', 2)}`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 1 })
  })

  it('reports a reply with no envelope', async () => {
    const { exchange } = make({ outbound: [fakeOutbound('clipboard')] })

    const result = await exchange.accept('うまく作れませんでした')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('no-envelope')
  })

  it('keeps the pending request when the reply cannot be parsed', async () => {
    const { exchange, store } = make({ outbound: [fakeOutbound('clipboard')] })
    await exchange.send()

    await exchange.accept('だめでした')

    expect(await store.list()).toHaveLength(1)
  })
})

describe('pull', () => {
  it('takes what the clipboard holds and imports it', async () => {
    const { exchange } = make({ outbound: [fakeOutbound('clipboard')] })
    const { rid } = await exchange.send()
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve(reply(rid, 4)) } })

    const result = await exchange.pull()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 4 })
    vi.unstubAllGlobals()
  })

  it('surfaces a refused read instead of returning a Result', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.reject(denied) } })
    const { exchange } = make()

    await expect(exchange.pull()).rejects.toThrow(UcpError)
    vi.unstubAllGlobals()
  })
})

describe('listen', () => {
  it('reports what an inbound transport delivers', async () => {
    const inbound = fakeInbound()
    const { exchange } = make({ outbound: [fakeOutbound('clipboard')], inbound: [inbound] })
    const { rid } = await exchange.send()

    const onResult = vi.fn()
    exchange.listen(onResult)
    inbound.emit(reply(rid, 5))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ via: 'sentinel-scan' }),
      }),
    )
  })

  it('stops every transport when disposed', () => {
    const inbound = fakeInbound()
    const { exchange } = make({ inbound: [inbound] })

    const dispose = exchange.listen(() => undefined)
    expect(inbound.live()).toBe(true)

    dispose()
    expect(inbound.live()).toBe(false)
  })
})

describe('preview', () => {
  it('returns a prompt without registering a pending request', async () => {
    const { exchange, store } = make()

    expect(exchange.preview({ instruction: '下見' })).toContain('下見')
    expect(await store.list()).toEqual([])
  })

  it('mints a fresh rid each time', () => {
    const { exchange } = make()
    expect(exchange.preview()).not.toBe(exchange.preview())
  })
})
