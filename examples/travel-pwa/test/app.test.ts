import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vite-plus/test'

const HERE = dirname(fileURLToPath(import.meta.url))

const reply = (destination: string) =>
  `作ってみました。\n\n\`\`\`json ucp\n${JSON.stringify({
    ucp: 1,
    kind: 'response',
    contract: 'trip.itinerary@1',
    data: {
      destination,
      summary: '和菓子と古い街並み',
      days: [
        {
          day: 1,
          title: '到着とひがし茶屋街',
          stops: [
            { time: '14:00', place: '金沢駅' },
            { time: '15:30', place: 'ひがし茶屋街', note: '和菓子屋を 2 軒' },
          ],
        },
      ],
    },
  })}\n\`\`\`\n\nいかがでしょう。`

/** dist ではなく index.html の中身をそのまま DOM に流し込み、main.ts を素で起動する。 */
const mountIndexHtml = () => {
  const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8')
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '')
}

const paste = (text: string) => {
  const event = Object.assign(new Event('paste', { bubbles: true }), {
    clipboardData: { getData: (mime: string) => (mime === 'text/plain' ? text : '') },
  })
  document.dispatchEvent(event)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('travel-pwa', () => {
  beforeAll(async () => {
    mountIndexHtml()
    await import('../src/main')
  })

  it('shows what the environment supports', () => {
    expect(document.getElementById('caps')?.textContent).toContain('paste イベント')
  })

  it('can preview the prompt it would send', () => {
    document.getElementById('toggle-preview')?.dispatchEvent(new Event('click'))

    const preview = document.getElementById('preview')
    expect(preview?.hidden).toBe(false)
    expect(preview?.textContent).toContain('和菓子と古い街並み')
    expect(preview?.textContent).toContain('"kind": "request"')
  })

  it('imports a pasted reply into the itinerary view', async () => {
    paste(reply('金沢'))
    await settle()

    const result = document.getElementById('result')
    expect(document.getElementById('result-card')?.hidden).toBe(false)
    expect(result?.textContent).toContain('金沢')
    expect(result?.textContent).toContain('Day 1')
    expect(result?.textContent).toContain('ひがし茶屋街')
    expect(result?.textContent).toContain('和菓子屋を 2 軒')
  })

  it('reports a reply it cannot use instead of failing silently', async () => {
    paste('すみません、今回は作れませんでした。')
    await settle()

    expect(document.getElementById('log')?.textContent).toContain('no-envelope')
  })

  it('rejects an envelope whose data breaks the contract', async () => {
    paste(
      JSON.stringify({
        ucp: 1,
        kind: 'response',
        contract: 'trip.itinerary@1',
        data: { days: [] },
      }),
    )
    await settle()

    expect(document.getElementById('log')?.textContent).toContain('validation-failed')
  })
})
