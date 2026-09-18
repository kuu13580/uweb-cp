import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { UcpError } from '../src/errors'
import { clipboardTransport } from '../src/transports/outbound/clipboard'
import { deepLinkTransport } from '../src/transports/outbound/deep-link'
import { downloadTransport } from '../src/transports/outbound/download'
import { webShareTransport } from '../src/transports/outbound/web-share'

const payload = { text: 'hello' }

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    return error instanceof UcpError ? error.code : 'not-a-ucp-error'
  }
  return 'no-throw'
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('webShareTransport', () => {
  it('is unavailable without navigator.share', () => {
    vi.stubGlobal('navigator', {})
    expect(webShareTransport().isAvailable()).toBe(false)
  })

  it('passes text, title and url through', async () => {
    const share = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { share })

    await webShareTransport().deliver({ text: 'hello', title: 't', url: 'https://example.com' })

    expect(share).toHaveBeenCalledWith({ text: 'hello', title: 't', url: 'https://example.com' })
  })

  it('omits title and url when not given', async () => {
    const share = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { share })

    await webShareTransport().deliver(payload)

    expect(share).toHaveBeenCalledWith({ text: 'hello' })
  })

  it('reports a closed share sheet as aborted, not as a failure', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    vi.stubGlobal('navigator', { share: () => Promise.reject(abort) })

    expect(await codeOf(() => webShareTransport().deliver(payload))).toBe('transport-aborted')
  })

  it('reports any other failure as unavailable', async () => {
    vi.stubGlobal('navigator', { share: () => Promise.reject(new Error('nope')) })
    expect(await codeOf(() => webShareTransport().deliver(payload))).toBe('transport-unavailable')
  })
})

describe('clipboardTransport', () => {
  it('writes the text', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await clipboardTransport().deliver(payload)

    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('is unavailable without the clipboard API', () => {
    vi.stubGlobal('navigator', {})
    expect(clipboardTransport().isAvailable()).toBe(false)
  })

  it('turns a permission denial into transport-unavailable', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: () => Promise.reject(new Error('denied')),
      },
    })

    expect(await codeOf(() => clipboardTransport().deliver(payload))).toBe('transport-unavailable')
  })
})

describe('deepLinkTransport', () => {
  const provider = { id: 'demo', template: 'https://example.com/new?q={prompt}', maxLength: 200 }

  it('rejects a template without the placeholder', () => {
    expect(() => deepLinkTransport({ ...provider, template: 'https://example.com' })).toThrow(
      UcpError,
    )
  })

  it('url-encodes the prompt into the template', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)

    await deepLinkTransport(provider).deliver({ text: 'a b&c' })

    expect(open).toHaveBeenCalledWith(
      'https://example.com/new?q=a%20b%26c',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('refuses a prompt that overflows the url limit', async () => {
    vi.stubGlobal('open', vi.fn())
    const long = { text: 'x'.repeat(500) }

    expect(await codeOf(() => deepLinkTransport(provider).deliver(long))).toBe('payload-too-large')
  })

  it('exposes the provider limit as maxLength', () => {
    expect(deepLinkTransport(provider).maxLength).toBe(200)
  })
})

/** 実物の anchor を作り、createElement がそれを返すようにする。 */
const stubAnchor = () => {
  const anchor = globalThis.document.createElement('a')
  vi.spyOn(globalThis.document, 'createElement').mockReturnValue(anchor)
  return anchor
}

describe('downloadTransport', () => {
  it('clicks an anchor carrying the blob and the filename', async () => {
    const anchor = stubAnchor()
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })

    await downloadTransport('trip.md').deliver(payload)

    expect(anchor.download).toBe('trip.md')
    expect(anchor.getAttribute('href')).toBe('blob:x')
    expect(click).toHaveBeenCalled()
  })

  it('releases the object url even when the click throws', async () => {
    const anchor = stubAnchor()
    vi.spyOn(anchor, 'click').mockImplementation(() => {
      throw new Error('blocked')
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL })

    await expect(downloadTransport().deliver(payload)).rejects.toThrow('blocked')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })
})
