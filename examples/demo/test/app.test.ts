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

  it('keeps the diagnostics out of the way unless asked', () => {
    // 公開ページに出すと混乱するので、?debug のときだけ見せる
    expect(document.getElementById('caps')?.hidden).toBe(true)
  })

  it('keeps only the controls needed to understand the round trip', () => {
    const ids = [
      ...document.querySelectorAll('#demo input, #demo textarea, #demo button, #demo select'),
    ].map((node) => node.id)
    expect(ids).toEqual(expect.arrayContaining(['topic', 'send', 'inbox', 'import']))

    // 理解に要らないものは畳むのではなく消した
    for (const gone of [
      'count',
      'nights',
      'date',
      'emit',
      'instruction',
      'toggle-preview',
      'drop',
    ]) {
      expect(document.getElementById(gone)).toBeNull()
    }
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

  it('presents the result as data, not prose', async () => {
    paste(reply('お題'))
    await settle()

    // 列見出しは実際のフィールド名。「型のある配列が届いた」ことを示すため
    expect([...document.querySelectorAll('table.data th')].map((th) => th.textContent)).toEqual([
      'title',
      'why',
      'effort',
    ])
    // 狭い画面で「フィールド名: 値」に落とすための印
    expect(document.querySelector('td[data-label="effort"]')).not.toBeNull()
  })

  it('summarises the payload so the shape is visible', async () => {
    paste(reply('お題'))
    await settle()

    const summary = document.querySelector('.summary')?.textContent ?? ''
    expect(summary).toContain('idea.list@1')
    expect(summary).toContain('ideas: 2 件')
    expect(summary).toContain('small 1')
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

    expect(document.getElementById('status')?.textContent).toContain('no-envelope')
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

    expect(document.getElementById('status')?.textContent).toContain('validation-failed')
  })
})
