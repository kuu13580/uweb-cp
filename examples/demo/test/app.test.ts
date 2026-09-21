import { beforeAll, describe, expect, it } from 'vite-plus/test'

const reply = (topic: string) =>
  `挙げてみました。\n\n\`\`\`json ucp\n${JSON.stringify({
    ucp: 1,
    kind: 'response',
    contract: 'idea.list@1',
    data: {
      topic,
      ideas: [
        {
          title: '未更新ページの棚卸しリマインド',
          why: '古い情報が残り続けるのが一番の害',
          effort: 'medium',
        },
        { title: 'ページ冒頭に「最終確認者」を出す', effort: 'small' },
      ],
    },
  })}\n\`\`\`\n\nいかがでしょう。`

/** README から生成される本文は使わず、デモの器だけ置いて main.ts を起動する。 */
const mountDemoRoot = () => {
  document.body.innerHTML = '<main><div id="demo"></div></main>'
}

const paste = (text: string) => {
  const event = Object.assign(new Event('paste', { bubbles: true }), {
    clipboardData: { getData: (mime: string) => (mime === 'text/plain' ? text : '') },
  })
  document.dispatchEvent(event)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('demo', () => {
  beforeAll(async () => {
    mountDemoRoot()
    await import('../src/main')
  })

  it('builds its own markup into the demo slot', () => {
    expect(document.getElementById('send')).not.toBeNull()
    expect(document.getElementById('inbox')).not.toBeNull()
    expect(document.getElementById('import')).not.toBeNull()
  })

  it('shows what the environment supports', () => {
    expect(document.getElementById('caps')?.textContent).toContain('paste イベント')
  })

  it('can preview the prompt it would send', () => {
    document.getElementById('toggle-preview')?.dispatchEvent(new Event('click'))

    const preview = document.getElementById('preview')
    expect(preview?.hidden).toBe(false)
    expect(preview?.textContent).toContain('チーム内 Wiki に足す機能')
    expect(preview?.textContent).toContain('"kind": "request"')
  })

  it('imports a pasted reply into the list view', async () => {
    paste(reply('チーム内 Wiki に足す機能'))
    await settle()

    const result = document.getElementById('result')
    expect(document.getElementById('result-card')?.hidden).toBe(false)
    expect(result?.textContent).toContain('チーム内 Wiki に足す機能')
    expect(result?.textContent).toContain('未更新ページの棚卸しリマインド')
    expect(result?.textContent).toContain('古い情報が残り続けるのが一番の害')
  })

  it('shows the effort enum as a badge', async () => {
    paste(reply('お題'))
    await settle()

    expect(document.querySelectorAll('.effort.medium')).toHaveLength(1)
    expect(document.querySelectorAll('.effort.small')).toHaveLength(1)
  })

  it('reports a reply it cannot use instead of failing silently', async () => {
    paste('すみません、今回は作れませんでした。')
    await settle()

    expect(document.getElementById('log')?.textContent).toContain('no-envelope')
  })

  it('rejects an envelope whose data breaks the contract', async () => {
    // effort が enum から外れている。UI のバッジに直結するので通してはいけない
    paste(
      JSON.stringify({
        ucp: 1,
        kind: 'response',
        contract: 'idea.list@1',
        data: { topic: 'お題', ideas: [{ title: 'x', effort: 'HUGE' }] },
      }),
    )
    await settle()

    expect(document.getElementById('log')?.textContent).toContain('validation-failed')
  })
})
