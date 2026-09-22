import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ENVELOPE_VERSION, isResponseEnvelope, type ResponseEnvelope } from './envelope'
import { findFencedRanges, findKeyedObjects, findObjects, isInside, type Range } from './scan'
import type { Contract, Issue, Result } from './types'

/** How the envelope was found. For debugging and telemetry. */
export type ExtractionVia = 'fenced' | 'sentinel-scan' | 'bare-json'

export interface ExtractOptions<T> {
  contract?: Contract<T>
  /**
   * The correlation id used when sending. A matching envelope wins, but this never filters:
   * models drop the field. A mismatch is reported as a warning issue and processing continues.
   */
  rid?: string
  /** Allow falling back to treating a bare JSON object as `data` when no envelope is found. */
  allowBareJson?: boolean
}

export interface Extraction<T> {
  envelope: ResponseEnvelope<T>
  via: ExtractionVia
  /** Non-fatal observations, such as a rid mismatch. */
  issues: readonly Issue[]
}

interface Candidate {
  envelope: ResponseEnvelope
  via: ExtractionVia
}

/** Pulls response envelopes out of a reply, in the order they appear. */
export function extractResponses(text: string): ResponseEnvelope[] {
  return collect(text).candidates.map((c) => c.envelope)
}

/**
 * Extraction, contract matching and validation through `contract.validate`.
 *
 * Standard Schema allows validation to be asynchronous, so the whole call returns a Promise.
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
        issues: [
          ...issues,
          { message: `contract mismatch: expected ${contract.ref}, got ${seen}` },
        ],
      }
    }
    pool = matching
  }

  let chosen = pick(pool, rid)

  if (!chosen && allowBareJson) {
    if (contract) chosen = bareCandidate(text, contract)
    else issues.push({ message: 'allowBareJson needs a contract' })
  }

  if (!chosen) {
    return { ok: false, code: malformed ? 'malformed-envelope' : 'no-envelope', issues }
  }

  if (rid && chosen.envelope.rid !== rid) {
    issues.push({
      message: `rid mismatch: expected ${rid}, got ${chosen.envelope.rid ?? 'none'}`,
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
  /** How many envelope-shaped objects had the wrong shape. Counted to tell this apart from no-envelope. */
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
      issues.push({ message: `unsupported envelope version: ${String(value.ucp)}` })
      malformed++
      continue
    }
    if (!isResponseEnvelope(value)) continue
    if (typeof value.contract !== 'string' || !('data' in value)) {
      issues.push({ message: 'response envelope is missing contract or data' })
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

/** Prefers a rid match, then the last one to appear. Filtering by contract happens in the caller. */
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
    // A contract without validate declares that the caller vouches for the type, so let it pass
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
