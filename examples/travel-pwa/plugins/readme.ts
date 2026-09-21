import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import type { Plugin } from 'vite-plus'

const HERE = dirname(fileURLToPath(import.meta.url))
const README = join(HERE, '..', '..', '..', 'README.md')

const REPO = 'https://github.com/kuu13580/uweb-cp'
const BRANCH = 'main'

/** README 側ではコメントなので何も見えず、ページ側ではこの区間がデモに差し替わる。 */
const DEMO = /<!--\s*demo:start\s*-->[\s\S]*?<!--\s*demo:end\s*-->/
const MOUNT = '<div id="demo" class="demo"></div>'

const PLACEHOLDER = '<!--README-->'

/**
 * README をページの本文にする。
 *
 * 同じ説明を README とページに二重に書くと無言でずれるため、出典を README 1 つに寄せる。
 * 手を入れる人向けの手順は CONTRIBUTING.md へ分けてあるので、丸ごと出して問題ない。
 */
export function readmePage(): Plugin {
  const render = () => {
    const md = new MarkdownIt({ html: true, linkify: true })
    const source = readFileSync(README, 'utf8')
    const html = md.render(source)
    return dropEmptyHeads(withAnchors(toRepoLinks(html))).replace(DEMO, MOUNT)
  }

  return {
    name: 'uweb-cp-readme',

    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(PLACEHOLDER, render),
    },

    configureServer(server) {
      // README を直せば即反映されるようにする
      server.watcher.add(README)
      server.watcher.on('change', (file) => {
        if (file === README) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

/**
 * `./docs/architecture.md` のような相対リンクは、配信していないので 404 になる。
 * GitHub 上のファイルへ向け直す。
 */
function toRepoLinks(html: string): string {
  return html.replace(/href="\.\/([^"]+)"/g, (_all, path: string) => {
    const kind = path.endsWith('/') ? 'tree' : 'blob'
    return `href="${REPO}/${kind}/${BRANCH}/${path}"`
  })
}

/**
 * 見出しが空の表（2 列の対比表）の thead を落とす。
 * CSS で thead を一律に隠すと、見出しのある表まで消えてしまうため。
 */
function dropEmptyHeads(html: string): string {
  return html.replace(/<thead>[\s\S]*?<\/thead>\n?/g, (block) =>
    block.replace(/<[^>]+>/g, '').trim() === '' ? '' : block,
  )
}

/** 見出しに id と `#` を付ける。ドキュメントとして参照できるように。 */
function withAnchors(html: string): string {
  let n = 0
  return html.replace(/<h2>(.*?)<\/h2>/g, (_all, text: string) => {
    n += 1
    const id = `s${n}`
    return `<h2 id="${id}"><a class="anchor" href="#${id}" aria-label="この節へのリンク">#</a>${text}</h2>`
  })
}
