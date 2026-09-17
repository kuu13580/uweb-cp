import type { ResponseEnvelope } from './envelope'
import type { Contract, Issue, Result } from './types'

export interface ExtractOptions<T> {
  contract?: Contract<T>
  /** 指定すると rid が一致する封筒のみを採用する。 */
  rid?: string
  /** 封筒が見つからない場合に、素の JSON を data とみなすフォールバックを許可する。 */
  allowBareJson?: boolean
}

export interface Extraction<T> {
  envelope: ResponseEnvelope<T>
  /** 封筒がどう見つかったか。デバッグとテレメトリ用。 */
  via: 'fenced' | 'sentinel-scan' | 'bare-json'
  issues: readonly Issue[]
}

/**
 * LLM 応答テキストから応答封筒を取り出す。
 * コードフェンスはコピー経路で失われるため、センチネルキー + 括弧の対応走査を主経路とする。
 *
 * TODO: 実装。
 */
export function extractResponses(_text: string): ResponseEnvelope[] {
  throw new Error('not implemented')
}

/** 抽出 + contract.validate による検証までを行う。TODO: 実装。 */
export function parseResponse<T>(
  _text: string,
  _options?: ExtractOptions<T>,
): Result<Extraction<T>> {
  throw new Error('not implemented')
}
