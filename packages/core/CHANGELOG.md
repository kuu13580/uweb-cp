# uweb-cp

## 0.1.0

### Minor Changes

- e12f9ae: First release. Hands structured context to the chat AI the user already has, and takes
  validated structured data back, using Web standards only — no server, no API key, no resident
  process.

  - `defineContract` / `createExchange` for the round trip, `buildPrompt` and the individual
    transports for driving it yourself
  - Envelope extraction anchored on the `"ucp"` sentinel, so it survives chat apps stripping code
    fences and reflowing prose
  - Outbound through Web Share, clipboard or download; inbound through paste, Web Share Target or
    a dropped file, with `send` falling back across what the browser actually supports
  - Validation is brought by the caller: anything implementing Standard Schema
