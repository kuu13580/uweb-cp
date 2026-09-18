import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { type Capabilities, detectCapabilities, recommendTransports } from '../src/capabilities'

const noop = () => undefined

/** display-mode クエリのうち、引数に挙げたものだけ matches を返す matchMedia。 */
const matchMediaFor = (...modes: string[]) =>
  vi.fn((query: string) => ({ matches: modes.some((m) => query.includes(m)) }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectCapabilities', () => {
  it('returns everything false when there is no DOM', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('document', undefined)

    expect(detectCapabilities()).toEqual({
      webShare: false,
      webShareFiles: false,
      clipboardWrite: false,
      clipboardRead: false,
      pasteEvent: false,
      shareTarget: 'unsupported',
      installedPwa: false,
    })
  })

  it('detects share and clipboard', () => {
    vi.stubGlobal('navigator', {
      share: noop,
      canShare: noop,
      clipboard: { writeText: noop, readText: noop },
    })
    vi.stubGlobal('matchMedia', matchMediaFor())

    const caps = detectCapabilities()
    expect(caps.webShare).toBe(true)
    expect(caps.webShareFiles).toBe(true)
    expect(caps.clipboardWrite).toBe(true)
    expect(caps.clipboardRead).toBe(true)
    expect(caps.pasteEvent).toBe(true)
  })

  it('reports clipboard write without read', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: noop } })
    vi.stubGlobal('matchMedia', matchMediaFor())

    const caps = detectCapabilities()
    expect(caps.clipboardWrite).toBe(true)
    expect(caps.clipboardRead).toBe(false)
  })

  it('treats a non-Chromium browser as unsupported for share target', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('matchMedia', matchMediaFor('standalone'))

    expect(detectCapabilities().shareTarget).toBe('unsupported')
  })

  it('reports installable on Chromium that is not installed yet', () => {
    vi.stubGlobal('navigator', { userAgentData: {}, serviceWorker: {} })
    vi.stubGlobal('matchMedia', matchMediaFor())

    const caps = detectCapabilities()
    expect(caps.installedPwa).toBe(false)
    expect(caps.shareTarget).toBe('installable')
  })

  it('reports installed on Chromium running standalone', () => {
    vi.stubGlobal('navigator', { userAgentData: {}, serviceWorker: {} })
    vi.stubGlobal('matchMedia', matchMediaFor('standalone'))

    const caps = detectCapabilities()
    expect(caps.installedPwa).toBe(true)
    expect(caps.shareTarget).toBe('installed')
  })

  it('falls back to navigator.standalone for iOS home-screen apps', () => {
    vi.stubGlobal('navigator', { standalone: true })
    vi.stubGlobal('matchMedia', matchMediaFor())

    expect(detectCapabilities().installedPwa).toBe(true)
  })

  it('survives a matchMedia that throws', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => {
        throw new Error('unsupported query')
      }),
    )

    expect(detectCapabilities().installedPwa).toBe(false)
  })
})

const caps = (overrides: Partial<Capabilities>): Capabilities => ({
  webShare: false,
  webShareFiles: false,
  clipboardWrite: false,
  clipboardRead: false,
  pasteEvent: true,
  shareTarget: 'unsupported',
  installedPwa: false,
  ...overrides,
})

describe('recommendTransports', () => {
  it('prefers web share, then clipboard, then download', () => {
    const { outbound } = recommendTransports(caps({ webShare: true, clipboardWrite: true }))
    expect(outbound).toEqual(['web-share', 'clipboard', 'download'])
  })

  it('always keeps download as the last resort', () => {
    expect(recommendTransports(caps({})).outbound).toEqual(['download'])
  })

  it('never omits deep-link by accident — it is opt-in', () => {
    const { outbound } = recommendTransports(caps({ webShare: true, clipboardWrite: true }))
    expect(outbound).not.toContain('deep-link')
  })

  it('always enables paste', () => {
    expect(recommendTransports(caps({})).inbound).toContain('paste')
  })

  it('adds share-target only when the PWA is installed', () => {
    expect(recommendTransports(caps({ shareTarget: 'installable' })).inbound).not.toContain(
      'share-target',
    )
    expect(recommendTransports(caps({ shareTarget: 'installed' })).inbound).toContain(
      'share-target',
    )
  })
})
