export type UcpErrorCode =
  | 'no-envelope'
  | 'malformed-envelope'
  | 'contract-mismatch'
  | 'validation-failed'
  | 'transport-unavailable'
  | 'transport-aborted'
  | 'payload-too-large'

export class UcpError extends Error {
  readonly code: UcpErrorCode

  constructor(code: UcpErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UcpError'
    this.code = code
  }
}
