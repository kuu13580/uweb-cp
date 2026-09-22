import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { codeToHtml } from 'shiki'
import type { Plugin } from 'vite-plus'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
// 英語版のページを出すときは UWEB_CP_README=README.en.md を渡す
const README = join(ROOT, process.env.UWEB_CP_README ?? 'README.md')

const REPO = 'https://github.com/kuu13580/uweb-cp'
const BRANCH = 'main'

/** README 側ではコメントなので何も見えず、ページ側ではこの区間がデモに差し替わる。 */
const DEMO = /<!--\s*demo:start\s*-->[\s\S]*?<!--\s*demo:end\s*-->/
const MOUNT = '<div id="demo" class="demo"></div>'

const PLACEHOLDER = '<!--README-->'

/** 言語を書いていないブロックは shell として塗る。README の install はこれ。 */
const DEFAULT_LANG = 'shell'

/**
 * README をページの本文にする。
 *
 * 同じ説明を README とページに二重に書くと無言でずれるため、出典を README 1 つに寄せる。
 * 手を入れる人向けの手順は CONTRIBUTING.md へ分けてあるので、丸ごと出して問題ない。
 */
export function readmePage(): Plugin {
  const render = async () => {
    const md = new MarkdownIt({ html: true, linkify: true })
    const html = md.render(readFileSync(README, 'utf8'))

    // タブで包むのは塗る前。塗った後だとコマンドが span に分断されて見つけられない
    const painted = await highlight(installTabs(html))

    const steps = [dropEmptyHeads, withAnchors, toRepoLinks, inlineLocalSvg]
    return steps.reduce((acc, step) => step(acc), painted).replace(DEMO, MOUNT)
  }

  return {
    name: 'uweb-cp-readme',

    transformIndexHtml: {
      order: 'pre',
      handler: async (html) => html.replace(PLACEHOLDER, await render()),
    },

    configureServer(server) {
      // README や図を直せば即反映されるようにする
      server.watcher.add([README, join(ROOT, 'docs')])
      server.watcher.on('change', (file) => {
        if (file.endsWith('README.md') || file.endsWith('.svg')) {
          server.ws.send({ type: 'full-reload' })
        }
      })
    },
  }
}

/**
 * コードブロックを Shiki で塗る。明暗 2 テーマを CSS 変数で持たせるので、
 * 配色の切り替えはページ側の CSS だけで済む。
 */
async function highlight(html: string): Promise<string> {
  const blocks = [
    ...html.matchAll(/<pre><code(?: class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/g),
  ]

  const painted = await Promise.all(
    blocks.map(([, lang, body]) =>
      codeToHtml(unescape(body ?? ''), {
        lang: lang ?? DEFAULT_LANG,
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false,
      }),
    ),
  )

  return blocks.reduce((acc, [whole, lang], i) => {
    const lg = lang ?? DEFAULT_LANG
    return acc.replace(whole, `<div class="code" data-lang="${lg}">${painted[i] ?? ''}</div>`)
  }, html)
}

function unescape(body: string): string {
  return body
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

/**
 * `npm i uweb-cp` のブロックに、他のパッケージマネージャのタブを添える。
 * コマンドはタブ名から導けるので、README には npm の 1 行だけ書いておけばよい。
 */
function installTabs(html: string): string {
  const INSTALL =
    /<pre><code(?: class="language-(?:sh|shell|bash)")?>npm i ([\w@/-]+)\n?<\/code><\/pre>/
  return html.replace(INSTALL, (block, pkg: string) => {
    const tabs = ['npm', 'pnpm', 'yarn', 'bun']
      .map(
        (m, i) =>
          `<button type="button" role="tab" data-pm="${m}" aria-selected="${i === 0}">${m}</button>`,
      )
      .join('')
    return `<div class="install" data-pkg="${pkg}"><div class="tabs" role="tablist">${tabs}</div>${block}</div>`
  })
}

/**
 * ローカルの SVG は img で参照せず、中身をそのまま埋める。
 * README では画像として、ページでは本文の一部として同じ 1 ファイルを使うため。
 */
function inlineLocalSvg(html: string): string {
  return html.replace(/<img src="\.\/([^"]+\.svg)"[^>]*>/g, (all, path: string) => {
    try {
      const svg = readFileSync(join(ROOT, path), 'utf8').replace(/<\?xml[\s\S]*?\?>\s*/, '')
      return `<figure class="fig">${svg}</figure>`
    } catch {
      return all
    }
  })
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

/**
 * 見出しに id と `#` を付ける。
 * id は見出し文から作る。連番だと節を足したときにリンクが黙って別の節を指すため。
 */
function withAnchors(html: string): string {
  return html.replace(/<h2>(.*?)<\/h2>/g, (_all, text: string) => {
    const id = slug(text)
    return `<h2 id="${id}"><a class="anchor" href="#${id}" aria-label="この節へのリンク">#</a>${text}</h2>`
  })
}

function slug(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .replaceAll(' ', '-')
}
