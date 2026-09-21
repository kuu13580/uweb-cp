import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { UcpError } from '../src/errors'
import { readClipboardText } from '../src/transports/inbound/clipboard'
import { fileDropTransport } from '../src/transports/inbound/file-drop'
import { pasteTransport } from '../src/transports/inbound/paste'
import { shareTargetManifest, shareTargetTransport } from '../src/transports/inbound/share-target'
import type { InboundMeta } from '../src/transports/types'

/** clipboardData / dataTransfer を載せた擬似イベント。happy-dom は中身を作れない。 */
const eventWith = (type: string, payload: Record<string, unknown>) =>
  Object.assign(new Event(type, { cancelable: true }), payload)

const transferOf = (text: string) => ({
  getData: (mime: string) => (mime === 'text/plain' ? text : ''),
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.unstubAllGlobals()
})

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    return error instanceof UcpError ? error.code : 'not-a-ucp-error'
  }
  return 'no-throw'
}

describe('readClipboardText', () => {
  it('returns what the clipboard holds', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve('hello') } })
    expect(await readClipboardText()).toBe('hello')
  })

  it('fails when the api is missing', async () => {
    vi.stubGlobal('navigator', {})
    expect(await codeOf(readClipboardText)).toBe('transport-unavailable')
  })

  it('separates a refusal from an unsupported environment', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.reject(denied) } })
    expect(await codeOf(readClipboardText)).toBe('transport-aborted')
  })

  it('reports any other failure as unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.reject(new Error('x')) } })
    expect(await codeOf(readClipboardText)).toBe('transport-unavailable')
  })
})

describe('pasteTransport', () => {
  it('hands over pasted text', () => {
    const target = new EventTarget()
    const seen: string[] = []
    pasteTransport(target).start((text) => seen.push(text))

    target.dispatchEvent(eventWith('paste', { clipboardData: transferOf('hello') }))

    expect(seen).toEqual(['hello'])
  })

  it('tags the source', () => {
    const target = new EventTarget()
    const metas: InboundMeta[] = []
    pasteTransport(target).start((_text, meta) => metas.push(meta))

    target.dispatchEvent(eventWith('paste', { clipboardData: transferOf('hello') }))

    expect(metas).toEqual([{ source: 'paste' }])
  })

  it('ignores an empty paste', () => {
    const target = new EventTarget()
    const seen: string[] = []
    pasteTransport(target).start((text) => seen.push(text))

    target.dispatchEvent(eventWith('paste', { clipboardData: transferOf('') }))
    target.dispatchEvent(eventWith('paste', {}))

    expect(seen).toEqual([])
  })

  it('stops listening once disposed', () => {
    const target = new EventTarget()
    const seen: string[] = []
    const dispose = pasteTransport(target).start((text) => seen.push(text))

    dispose()
    target.dispatchEvent(eventWith('paste', { clipboardData: transferOf('hello') }))

    expect(seen).toEqual([])
  })
})

describe('fileDropTransport', () => {
  it('takes plain text from the drop', async () => {
    const target = new EventTarget()
    const seen: string[] = []
    fileDropTransport(target).start((text) => seen.push(text))

    target.dispatchEvent(eventWith('drop', { dataTransfer: transferOf('dropped') }))
    await tick()

    expect(seen).toEqual(['dropped'])
  })

  it('reads the first file when there is no plain text', async () => {
    const target = new EventTarget()
    const seen: string[] = []
    fileDropTransport(target).start((text) => seen.push(text))

    target.dispatchEvent(
      eventWith('drop', {
        dataTransfer: {
          getData: () => '',
          files: { 0: { text: () => Promise.resolve('from file') } },
        },
      }),
    )
    await tick()

    expect(seen).toEqual(['from file'])
  })

  it('cancels dragover so the browser does not open the file', () => {
    const target = new EventTarget()
    fileDropTransport(target).start(() => undefined)

    const event = new Event('dragover', { cancelable: true })
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('stops listening once disposed', async () => {
    const target = new EventTarget()
    const seen: string[] = []
    const dispose = fileDropTransport(target).start((text) => seen.push(text))

    dispose()
    target.dispatchEvent(eventWith('drop', { dataTransfer: transferOf('dropped') }))
    await tick()

    expect(seen).toEqual([])
  })
})

const stubLocation = (search: string, pathname = '/') => {
  vi.stubGlobal('location', { search, pathname })
  vi.stubGlobal('history', { replaceState: vi.fn() })
}

describe('shareTargetTransport', () => {
  it('picks up shared text from the launch url', async () => {
    stubLocation('?text=hello&title=t&url=https%3A%2F%2Fexample.com')
    const seen: Array<[string, InboundMeta]> = []

    shareTargetTransport().start((text, meta) => seen.push([text, meta]))
    await tick()

    expect(seen).toEqual([
      ['hello', { source: 'share-target', title: 't', url: 'https://example.com' }],
    ])
  })

  it('falls back to the shared url when there is no text', async () => {
    stubLocation('?url=https%3A%2F%2Fexample.com')
    const seen: string[] = []

    shareTargetTransport().start((text) => seen.push(text))
    await tick()

    expect(seen).toEqual(['https://example.com'])
  })

  it('clears the query so a reload does not re-import', async () => {
    stubLocation('?text=hello', '/import')
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })

    shareTargetTransport().start(() => undefined)
    await tick()

    expect(replaceState).toHaveBeenCalledWith(null, '', '/import')
  })

  it('keeps the query when asked to', async () => {
    stubLocation('?text=hello')
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })

    shareTargetTransport({ cleanUrl: false }).start(() => undefined)
    await tick()

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('ignores a launch on a different path than the configured action', async () => {
    stubLocation('?text=hello', '/other')
    const seen: string[] = []

    shareTargetTransport({ action: '/import' }).start((text) => seen.push(text))
    await tick()

    expect(seen).toEqual([])
  })

  it('honours custom param names', async () => {
    stubLocation('?body=hello')
    const seen: string[] = []

    shareTargetTransport({ params: { text: 'body' } }).start((text) => seen.push(text))
    await tick()

    expect(seen).toEqual(['hello'])
  })

  it('does nothing without a query', async () => {
    stubLocation('')
    const seen: string[] = []

    shareTargetTransport().start((text) => seen.push(text))
    await tick()

    expect(seen).toEqual([])
  })

  it('does not fire after being disposed within the same tick', async () => {
    stubLocation('?text=hello')
    const seen: string[] = []

    shareTargetTransport().start((text) => seen.push(text))()
    await tick()

    expect(seen).toEqual([])
  })
})

describe('shareTargetManifest', () => {
  it('defaults to a GET target at the root', () => {
    expect(shareTargetManifest()).toEqual({
      action: '/',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    })
  })

  it('mirrors the options the transport reads', () => {
    expect(shareTargetManifest({ action: '/import', params: { text: 'body' } })).toEqual({
      action: '/import',
      method: 'GET',
      params: { title: 'title', text: 'body', url: 'url' },
    })
  })
})
