import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ENVELOPE_VERSION, isResponseEnvelope, type ResponseEnvelope } from './envelope'
import { findFencedRanges, findKeyedObjects, findObjects, isInside, type Range } from './scan'
import type { Contract, Issue, Result } from './types'

/** 封筒がどう見つかったか。デバッグとテレメトリ用。 */
export type ExtractionVia = 'fenced' | 'sentinel-scan' | 'bare-json'

export interface ExtractOptions<T> {
  contract?: Contract<T>
  /**
   * 送信時の相関 ID。一致する封筒を優先するが、LLM が落とすことがあるため
   * 絞り込みには使わない。一致しなかった場合は警告 issue を付けて続行する。
   */
  rid?: string
  /** 封筒が見つからない場合に、素の JSON を data とみなすフォールバックを許可する。 */
  allowBareJson?: boolean
}

export interface Extraction<T> {
  envelope: ResponseEnvelope<T>
  via: ExtractionVia
  /** 致命的ではない気づき。rid 不一致など。 */
  issues: readonly Issue[]
}

interface Candidate {
  envelope: ResponseEnvelope
  via: ExtractionVia
}

/** LLM 応答テキストから応答封筒を出現順に取り出す。 */
export function extractResponses(text: string): ResponseEnvelope[] {
  return collect(text).candidates.map((c) => c.envelope)
}

/**
 * 抽出 + 契約の突き合わせ + `contract.validate` による検証。
 *
 * Standard Schema の検証は非同期を許すため、全体が Promise を返す。
 */
export async function parseResponse<T>(
  text: string,
  options: ExtractOptions<T> = {},
): Promise<Result<Extraction<T>>> {
  const { contract, rid, allowBareJson } = options
  const { candidates, issues: scanIssues, malformed } = collect(text)
  const issues: Issue[] = [...scanIssues]

  let pool = candidates
  if (contract) {
    const matching = pool.filter((c) => c.envelope.contract === contract.ref)
    if (pool.length > 0 && matching.length === 0) {
      const seen = pool.map((c) => c.envelope.contract).join(', ')
      return {
        ok: false,
        code: 'contract-mismatch',
        issues: [...issues, { message: `契約が一致しない: 期待 ${contract.ref} / 受信 ${seen}` }],
      }
    }
    pool = matching
  }

  let chosen = pick(pool, rid)

  if (!chosen && allowBareJson) {
    if (contract) chosen = bareCandidate(text, contract)
    else issues.push({ message: 'allowBareJson には contract が必要' })
  }

  if (!chosen) {
    return { ok: false, code: malformed ? 'malformed-envelope' : 'no-envelope', issues }
  }

  if (rid && chosen.envelope.rid !== rid) {
    issues.push({
      message: `rid が一致しない: 期待 ${rid} / 受信 ${chosen.envelope.rid ?? 'なし'}`,
    })
  }

  const validated = await validate<T>(chosen.envelope.data, contract)
  if (!validated.ok) {
    return { ok: false, code: 'validation-failed', issues: [...issues, ...validated.issues] }
  }

  const envelope: ResponseEnvelope<T> = { ...chosen.envelope, data: validated.value }
  return { ok: true, value: { envelope, via: chosen.via, issues } }
}

interface Collected {
  candidates: Candidate[]
  issues: Issue[]
  /** 封筒らしきものは見つかったが形が違った件数。no-envelope と区別するために数える。 */
  malformed: number
}

function collect(text: string): Collected {
  const fences = findFencedRanges(text)
  const candidates: Candidate[] = []
  const issues: Issue[] = []
  let malformed = 0

  for (const span of findKeyedObjects(text, 'ucp')) {
    const value = span.value
    if (typeof value !== 'object' || value === null || !('ucp' in value)) continue

    if (value.ucp !== ENVELOPE_VERSION) {
      issues.push({ message: `未対応の封筒バージョン: ${String(value.ucp)}` })
      malformed++
      continue
    }
    if (!isResponseEnvelope(value)) continue
    if (typeof value.contract !== 'string' || !('data' in value)) {
      issues.push({ message: '応答封筒に contract または data がない' })
      malformed++
      continue
    }

    candidates.push({ envelope: value, via: viaOf(fences, span.start) })
  }

  return { candidates, issues, malformed }
}

function viaOf(fences: readonly Range[], at: number): ExtractionVia {
  return isInside(fences, at) ? 'fenced' : 'sentinel-scan'
}

/** rid 一致 → 最後に出現したもの、の順で選ぶ。契約での絞り込みは呼び出し側で済ませておく。 */
function pick(candidates: readonly Candidate[], rid?: string): Candidate | undefined {
  if (rid) {
    const byRid = candidates.filter((c) => c.envelope.rid === rid)
    if (byRid.length > 0) return byRid.at(-1)
  }
  return candidates.at(-1)
}

function bareCandidate<T>(text: string, contract: Contract<T>): Candidate | undefined {
  const span = findObjects(text).at(-1)
  if (!span) return undefined

  return {
    envelope: {
      ucp: ENVELOPE_VERSION,
      kind: 'response',
      contract: contract.ref,
      data: span.value,
    },
    via: 'bare-json',
  }
}

async function validate<T>(data: unknown, contract?: Contract<T>): Promise<Result<T>> {
  const standard = contract?.validate?.['~standard']
  if (!standard) {
    // validate 未指定の契約は「型は利用者が保証する」という宣言なので、ここは素通しする
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { ok: true, value: data as T }
  }

  const result = await standard.validate(data)
  if (result.issues) {
    return { ok: false, code: 'validation-failed', issues: result.issues.map(toIssue) }
  }
  return { ok: true, value: result.value }
}

function toIssue(issue: StandardSchemaV1.Issue): Issue {
  const path = issue.path?.flatMap((segment) => {
    const key = typeof segment === 'object' ? segment.key : segment
    return typeof key === 'string' || typeof key === 'number' ? [key] : []
  })
  return path && path.length > 0 ? { message: issue.message, path } : { message: issue.message }
}
