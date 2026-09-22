# uweb-cp

[![CI](https://github.com/kuu13580/uweb-cp/actions/workflows/ci.yml/badge.svg)](https://github.com/kuu13580/uweb-cp/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-2a3a6e)](https://github.com/kuu13580/uweb-cp/blob/main/LICENSE)
[![deps](https://img.shields.io/badge/runtime%20deps-0-2a3a6e)](https://github.com/kuu13580/uweb-cp/blob/main/packages/core/package.json)

**µweb-cp — Micro Web Context Provider.** A TypeScript library that carries structured data
between your web app and the chat AI your user already pays for, using Web standards only.

No server, no API key, no resident process. The transport is the user: a share sheet, or a
copy and a paste.

## Install

```sh
npm i uweb-cp
```

The shipped JavaScript imports nothing. The single dependency, `@standard-schema/spec`, is
types-only and appears in the `.d.ts` alone.

Validation is brought by you — anything implementing
[Standard Schema](https://standardschema.dev/) works.

## Why

Enumerating, drafting and sifting are faster to hand to an AI. But you want the answer back
**inside your app, as data you can trust** — not as prose in a chat window.

Standing up an MCP server or a local LLM for that one round trip is too much machinery, and it
asks the user for an API key they should not need. Your user already has a chat app they know
how to use. µweb-cp **treats the user as the transport**, so the round trip needs nothing
installed and nothing configured.

## Usage

```ts
import { createExchange, defineContract } from 'uweb-cp'
import { z } from 'zod'

const schema = z.object({
  topic: z.string(),
  ideas: z
    .array(
      z.object({
        title: z.string().max(60),
        why: z.string().optional(),
        effort: z.enum(['small', 'medium', 'large']),
      }),
    )
    .min(1)
    .max(20),
})

// 1. Declare the shape you want back.
const ideaList = defineContract<z.infer<typeof schema>>({
  id: 'idea.list',
  description: 'List concrete, non-overlapping ideas for the given topic.',
  jsonSchema: z.toJSONSchema(schema),
  validate: schema,
})

// 2. Let the user talk it through, and emit the envelope only once they approve.
const exchange = createExchange({ contract: ideaList, emit: 'on-approval' })

// 3. App to AI — share sheet if available, clipboard otherwise.
await exchange.send({ context: { topic: 'features for our team wiki', count: 8 } })

// 4. AI to app — paste, Web Share Target, or a dropped file.
exchange.listen((result) => {
  if (result.ok) addIdeas(result.value.envelope.data.ideas)
})
```

`addIdeas` is a function you already have. What µweb-cp guarantees is only that **its argument
arrives validated**.

### API

|                                                                |                                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `defineContract(input)`                                        | Names a shape, its JSON Schema (sent to the AI) and its validator (guards the reply).                                            |
| `createExchange(options)`                                      | One contract's send and receive. `send` / `listen` / `accept` / `pull` / `preview`.                                              |
| `buildPrompt(options)`                                         | The prompt text alone, if you drive the transports yourself.                                                                     |
| `extractResponses(text)` / `parseResponse(text, { contract })` | Find and validate an envelope in arbitrary text.                                                                                 |
| `detectCapabilities()` / `recommendTransports(caps)`           | What this browser can do, and the transport order to prefer. Safe to call during SSR — everything reports `false` without a DOM. |

`uweb-cp/transports` exports the individual transports, plus `shareTargetManifest()` for the
`share_target` entry in your web app manifest.

## The round trip

Requests and replies travel as a UCP-1 envelope embedded in ordinary chat prose:

```json
{
  "ucp": 1,
  "kind": "response",
  "rid": "r_9f3c1a7b",
  "contract": "idea.list@1",
  "data": { "topic": "features for our team wiki", "ideas": [] }
}
```

`"ucp"` is both the version and the search sentinel. Extraction never parses the prose around
it: it finds the sentinel, scans forward for the balanced object, and validates. That survives
chat apps stripping code fences, renumbering lists or wrapping lines.

`rid` correlates a reply with the request that asked for it, so an answer that arrives ten turns
later — or after the user has closed and reopened your app — still lands in the right place.

## Not in scope

- Relaying to a local LLM (Ollama, llama.cpp). The target is **the consumer chat app already on
  the user's device**.
- Autonomous tool calling by the model. That is what MCP is for.

## Notes

- Prompt scaffolding is English by default. Pass `locale: 'ja'` for Japanese; the language should
  follow your app's user, not this package.
- Web Share Target needs Chromium and an installed PWA. `send` falls back through the available
  transports, so the round trip still works without it.
- The library ships one round trip. Everything about _what_ the AI should do belongs in
  `instruction`, which is yours to write.

## Docs

- [Architecture](https://github.com/kuu13580/uweb-cp/blob/main/docs/architecture.md) — the four layers, and the platform constraints behind the design
- [UCP-1 envelope format](https://github.com/kuu13580/uweb-cp/blob/main/docs/protocol.md) — the wire format and the scan rules
- [Decision records](https://github.com/kuu13580/uweb-cp/tree/main/docs/adr) — why it is built this way

The repository and the [live demo](https://kuu13580.github.io/uweb-cp/) are documented in
Japanese; this package's README is the English entry point.

## License

MIT
