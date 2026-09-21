import { UcpError } from '../../errors'
import { callMethod, getProp, hasMethod } from '../../reflect'

/**
 * クリップボードを読んで中身を返す。
 *
 * これは購読 (InboundTransport) ではなく引き取り。`navigator.clipboard.readText()` は
 * 利用者の操作の中からしか呼べず、環境によっては権限確認も出るため、いつ呼ぶかは
 * 実装者が決める必要がある。土台が paste である理由は変わらない (ADR-0003)。
 *
 * 使えるかどうかは `detectCapabilities().clipboardRead` で先に判定できる。
 */
export async function readClipboardText(): Promise<string> {
  const clipboard = getProp(globalThis.navigator, 'clipboard')
  if (!hasMethod(clipboard, 'readText')) {
    throw new UcpError('transport-unavailable', 'navigator.clipboard.readText が使えない')
  }

  let text: unknown
  try {
    text = await callMethod(clipboard, 'readText', [])
  } catch (cause) {
    // 権限拒否と、操作の外から呼んだ場合を分ける。前者は利用者の意思なので再試行しない
    const denied = cause instanceof Error && cause.name === 'NotAllowedError'
    throw new UcpError(
      denied ? 'transport-aborted' : 'transport-unavailable',
      denied ? 'クリップボードの読み取りを拒否された' : 'クリップボードを読めなかった',
      { cause },
    )
  }

  return typeof text === 'string' ? text : ''
}
