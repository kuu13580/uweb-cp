import { UcpError } from '../../errors'
import { hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

export interface DeepLinkProvider {
  id: string
  /** For example 'https://example.com/new?q={prompt}' — {prompt} is filled in URL-encoded. */
  template: string
  /** Practical limit for the whole URL. Past it, the transport counts as unusable. */
  maxLength: number
}

const PLACEHOLDER = '{prompt}'

/**
 * Deep link to a provider-specific URL.
 *
 * These URL parameters are undocumented and change without notice — claude.ai/new?q= was in
 * fact withdrawn — so the library ships no destinations, only the means to supply a template.
 */
export function deepLinkTransport(provider: DeepLinkProvider): OutboundTransport {
  if (!provider.template.includes(PLACEHOLDER)) {
    throw new UcpError(
      'transport-unavailable',
      `template does not contain ${PLACEHOLDER}: ${provider.template}`,
    )
  }

  return {
    id: 'deep-link',
    maxLength: provider.maxLength,

    isAvailable() {
      return hasMethod(globalThis, 'open')
    },

    // Failures must surface as a rejection, since the caller's fallback chain awaits this
    async deliver(payload) {
      const url = provider.template.replace(PLACEHOLDER, encodeURIComponent(payload.text))

      if (url.length > provider.maxLength) {
        throw new UcpError(
          'payload-too-large',
          `${url.length} characters against ${provider.id}'s limit of ${provider.maxLength}`,
        )
      }
      if (!hasMethod(globalThis, 'open')) {
        throw new UcpError('transport-unavailable', 'window.open is unavailable')
      }

      globalThis.open(url, '_blank', 'noopener,noreferrer')
      await Promise.resolve()
    },
  }
}
