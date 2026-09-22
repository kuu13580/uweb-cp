import { UcpError } from '../../errors'
import { callMethod, getProp, hasMethod } from '../../reflect'

/**
 * Reads the clipboard and returns its contents.
 *
 * This is a pull, not an InboundTransport subscription. `navigator.clipboard.readText()` can
 * only be called from inside a user gesture and may prompt for permission, so when to call it
 * has to be the integrator's decision. None of that changes why paste is the baseline (ADR-0003).
 *
 * Check `detectCapabilities().clipboardRead` first to know whether it is usable at all.
 */
export async function readClipboardText(): Promise<string> {
  const clipboard = getProp(globalThis.navigator, 'clipboard')
  if (!hasMethod(clipboard, 'readText')) {
    throw new UcpError('transport-unavailable', 'navigator.clipboard.readText is unavailable')
  }

  let text: unknown
  try {
    text = await callMethod(clipboard, 'readText', [])
  } catch (cause) {
    // Separate a denied permission from a call outside a gesture: the first is the user's own
    const denied = cause instanceof Error && cause.name === 'NotAllowedError'
    throw new UcpError(
      denied ? 'transport-aborted' : 'transport-unavailable',
      denied ? 'clipboard read was denied' : 'could not read the clipboard',
      { cause },
    )
  }

  return typeof text === 'string' ? text : ''
}
