import {
  type Capabilities,
  createExchange,
  createLocalStorageStore,
  detectCapabilities,
  type Extraction,
  recommendTransports,
  type Result,
  type SendInput,
  UcpError,
} from 'uweb-cp'
import { type IdeaList, ideaListContract } from './contract'
import { icon } from './icons'

// --- DOM の取り回し -----------------------------------------------------------

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`#${id} が無い`)
  return found
}

/** ページの器は無くてもデモは動くべきなので、器側の参照はこちらを使う。 */
function maybe(id: string): HTMLElement | undefined {
  return document.getElementById(id) ?? undefined
}

function field(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const found = el(id)
  if (
    found instanceof HTMLInputElement ||
    found instanceof HTMLTextAreaElement ||
    found instanceof HTMLSelectElement
  ) {
    return found
  }
  throw new Error(`#${id} は入力欄ではない`)
}

function button(id: string): HTMLButtonElement {
  const found = el(id)
  if (found instanceof HTMLButtonElement) return found
  throw new Error(`#${id} はボタンではない`)
}

/**
 * 状態は 1 行だけ見せる。取り込めなかった理由が分からないのが一番困るので、
 * 表示自体は残す。詳細は console に出す。
 */
function log(message: string, kind: 'ok' | 'warn' | 'bad' | '' = ''): void {
  const status = maybe('status')
  if (status) {
    status.textContent = message
    status.className = `status ${kind}`
    // スマホではカードが画面より高く、状態行が送信ボタンの 200px 以上下に来る。
    // nearest なので既に見えていれば動かない
    status.scrollIntoView({ block: 'nearest' })
  }
  console.debug(`[uweb-cp] ${message}`)
}

// --- ページの器 ---------------------------------------------------------------

type Theme = 'auto' | 'light' | 'dark'

const THEMES: Theme[] = ['auto', 'light', 'dark']
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' } as const
const THEME_KEY = 'uweb-cp:theme'

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return THEMES.find((t) => t === saved) ?? 'auto'
  } catch {
    return 'auto'
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)

  const toggle = maybe('theme')
  if (toggle) toggle.innerHTML = icon(THEME_ICON[theme], 14)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // プライベートウィンドウなど。見た目は切り替わるので続行する
  }
}

function setUpChrome(): void {
  const logo = maybe('logo')
  if (logo) logo.innerHTML = icon('arrow-left-right', 15)

  let theme = readTheme()
  applyTheme(theme)

  maybe('theme')?.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'auto'
    applyTheme(theme)
  })
}

async function copyBlock(pre: HTMLElement, copy: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(pre.innerText)
  } catch {
    return
  }
  copy.innerHTML = icon('check', 13)
  copy.classList.add('done')
  setTimeout(() => {
    copy.innerHTML = icon('copy', 13)
    copy.classList.remove('done')
  }, 1200)
}

/** コード例をそのまま持っていけるように、各ブロックへコピーを付ける。 */
function setUpCopyButtons(): void {
  for (const block of document.querySelectorAll('.code')) {
    const pre = block.querySelector('pre')
    if (!pre) continue

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'copy'
    copy.setAttribute('aria-label', 'コードをコピー')
    copy.innerHTML = icon('copy', 13)

    copy.addEventListener('click', () => {
      void copyBlock(pre, copy)
    })

    block.append(copy)
  }
}

/** install のコマンドはタブ名から導けるので、README には npm の 1 行だけ置いてある。 */
function setUpInstallTabs(): void {
  const install = document.querySelector('.install')
  const pre = install?.querySelector('pre')
  const pkg = install?.getAttribute('data-pkg')
  if (!install || !pre || !pkg) return

  const command: Record<string, string> = {
    npm: `npm i ${pkg}`,
    pnpm: `pnpm add ${pkg}`,
    yarn: `yarn add ${pkg}`,
    bun: `bun add ${pkg}`,
  }

  install.addEventListener('click', (event) => {
    const tab = event.target instanceof Element ? event.target.closest('[data-pm]') : null
    const manager = tab?.getAttribute('data-pm')
    if (!manager || !command[manager]) return

    for (const other of install.querySelectorAll('[data-pm]')) {
      other.setAttribute('aria-selected', String(other === tab))
    }
    pre.textContent = command[manager]
  })
}

// --- デモの骨組み -------------------------------------------------------------

/**
 * 本文は README から生成されるので、デモは `<!-- demo -->` の位置に置かれた
 * 空の器へ自分で組み立てる。定数の HTML なので innerHTML で足りる。
 */
function renderDemo(): void {
  el('demo').innerHTML = `
    <div class="duo">
      <div>
        <p class="step out">1 送る</p>
        <div class="row">
          <input id="topic" value="チーム内 Wiki に足す機能" aria-label="お題" />
          <button id="send">AI に送る</button>
        </div>
        <p class="hint">AI と相談して、決まったら「確定」と送ってください。</p>
      </div>
      <div>
        <p class="step in">2 受け取る</p>
        <textarea id="inbox" placeholder="AI の返信をそのまま貼り付け"></textarea>
        <div class="row">
          <button id="import" class="sub">取り込む</button>
          <button id="pull" class="sub" hidden>クリップボードから</button>
        </div>
      </div>
    </div>

    <p id="status" class="status" role="status"></p>
    <div id="result-card" hidden><div id="result"></div></div>
    <div id="caps" class="caps" hidden></div>`
}

function renderCapabilities(capabilities: Capabilities): void {
  const recommended = recommendTransports(capabilities)
  const rows: Array<[string, string, boolean]> = [
    ['navigator.share', String(capabilities.webShare), capabilities.webShare],
    ['clipboard.writeText', String(capabilities.clipboardWrite), capabilities.clipboardWrite],
    ['clipboard.readText', String(capabilities.clipboardRead), capabilities.clipboardRead],
    ['paste イベント', String(capabilities.pasteEvent), capabilities.pasteEvent],
    ['PWA インストール済み', String(capabilities.installedPwa), capabilities.installedPwa],
    ['Share Target', capabilities.shareTarget, capabilities.shareTarget === 'installed'],
    ['送信の優先順', recommended.outbound.join(' → '), true],
    ['受信', recommended.inbound.join(', '), true],
  ]

  el('caps').replaceChildren(
    ...rows.map(([name, value, good]) => {
      const row = document.createElement('div')
      const label = document.createElement('span')
      label.textContent = name
      const state = document.createElement('span')
      state.textContent = value
      if (good) state.className = 'yes'
      row.append(label, state)
      return row
    }),
  )
}

const EFFORT_ORDER = ['small', 'medium', 'large'] as const

/**
 * 結果は表で出し、列見出しに実際のフィールド名を使う。
 * 「文章が返ってきた」ではなく「型のある配列が届いた」ことを、操作を増やさずに示すため。
 * data は LLM 由来なので、文字列は必ず textContent として置く。
 */
function renderIdeas(list: IdeaList): void {
  const counts = EFFORT_ORDER.map(
    (level) => `${level} ${list.ideas.filter((i) => i.effort === level).length}`,
  ).join(' / ')

  const summary = document.createElement('p')
  summary.className = 'summary'
  summary.append(
    tag('code', ideaListContract.ref),
    tag('span', ' ✓ 検証済み', 'ok'),
    tag('span', `topic: ${list.topic}`, 'cell'),
    tag('span', `ideas: ${list.ideas.length} 件`, 'cell'),
    tag('span', `effort: ${counts}`, 'cell'),
  )

  const head = document.createElement('tr')
  for (const name of ['title', 'why', 'effort']) head.append(tag('th', name))

  const body = document.createElement('tbody')
  for (const entry of list.ideas) {
    const row = document.createElement('tr')
    row.append(
      cell('title', entry.title, 'title'),
      cell('why', entry.why ?? '—', 'note'),
      cell('effort', entry.effort, `effort ${entry.effort}`),
    )
    body.append(row)
  }

  const table = document.createElement('table')
  table.className = 'data'
  const thead = document.createElement('thead')
  thead.append(head)
  table.append(thead, body)

  el('result').replaceChildren(summary, table)
  el('result-card').hidden = false
}

function tag(name: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(name)
  node.textContent = text
  if (className) node.className = className
  return node
}

/** セルには data-label を持たせる。狭い画面で「フィールド名: 値」に落とすため。 */
function cell(label: string, text: string, className: string): HTMLElement {
  const node = document.createElement('td')
  node.dataset.label = label
  node.append(tag('span', text, className))
  return node
}

// --- 本体 ---------------------------------------------------------------------

setUpChrome()
setUpCopyButtons()
setUpInstallTabs()
renderDemo()

const capabilities = detectCapabilities()

/**
 * 実機検証用。公開ページには出さず、?debug のときだけ見せる。
 *
 * インストール済み PWA は start_url で開くので URL にクエリを足せない。ブラウザで一度
 * ?debug を開けば同じオリジンの localStorage 越しにアプリ側でも出る。?debug=0 で消す。
 */
const DEBUG_KEY = 'uweb-cp:debug'

function debugWanted(): boolean {
  const param = new URLSearchParams(location.search).get('debug')
  try {
    if (param === '0') localStorage.removeItem(DEBUG_KEY)
    else if (param !== null) localStorage.setItem(DEBUG_KEY, '1')
    return localStorage.getItem(DEBUG_KEY) !== null
  } catch {
    return param !== null && param !== '0'
  }
}

if (debugWanted()) {
  const caps = maybe('caps')
  if (caps) caps.hidden = false
  renderCapabilities(capabilities)
}

// 戻り先の文面はアプリの UX なので、ライブラリ任せにせずここで決める
const store = createLocalStorageStore()
const base = {
  contract: ideaListContract,
  locale: 'ja',
  store,
  returnTo: { name: 'uweb-cp のデモ', url: new URL(import.meta.env.BASE_URL, location.href).href },
} as const

/** 列挙は相談してから確定するのが自然なので、このデモは on-approval で固定する。 */
const exchange = createExchange({ ...base, emit: 'on-approval' })

function currentInput(): SendInput {
  return { context: { topic: field('topic').value } }
}

async function sendNow(): Promise<void> {
  const send = button('send')
  send.disabled = true

  try {
    const { via, rid, prompt, approvalPhrase } = await exchange.send(currentInput())
    console.debug(`[uweb-cp] 送信した: rid=${rid} (${prompt.length} 文字)`)

    // 状態行は 1 行しか出せないので畳む。経路名を残すのは、実機でどれが選ばれたかが
    // 手元の console では見られないため (検証はスマホで行う)
    const notes = [
      via === 'clipboard' ? 'クリップボードに入れました。AI に貼り付けてください' : '',
      approvalPhrase ? `内容を詰めたら AI に「${approvalPhrase}」と送ると封筒が出ます` : '',
    ].filter(Boolean)
    log([`送信した（${via}）`, ...notes].join(' — '), notes.length > 0 ? 'warn' : 'ok')
  } catch (error) {
    log(`送信できなかった: ${error instanceof Error ? error.message : String(error)}`, 'bad')
  } finally {
    send.disabled = false
  }
}

function handleResult(result: Result<Extraction<IdeaList>>): void {
  // 状態は 1 行しか出せないので、コードと最初の理由を 1 本に畳む
  if (result.ok) {
    const { envelope, via, issues } = result.value
    const note = issues[0]?.message
    log(
      `${envelope.data.ideas.length} 件を取り込みました（${via}）${note ? ` — ${note}` : ''}`,
      issues.length > 0 ? 'warn' : 'ok',
    )
    renderIdeas(envelope.data)
    return
  }

  const reason = result.issues[0]?.message
  log(`取り込めませんでした (${result.code})${reason ? ` — ${reason}` : ''}`, 'bad')
}

/**
 * 経路に依存しない取り込み口。
 * paste イベントが飛んでこない環境 (一部の WebView や IME 経由の貼り付け) でも、
 * ここを押せば必ず同じ処理に入る。切り分けのためにも残す。
 */
async function importFromInbox(): Promise<void> {
  const text = field('inbox').value.trim()
  if (!text) {
    log('取り込む内容が空です', 'warn')
    return
  }
  log(`手動で取り込み: ${text.length} 文字`)
  handleResult(await exchange.accept(text))
}

/** 引き取りは利用者の操作の中からしか呼べないので、ボタンの中で呼ぶ。 */
async function pullFromClipboard(): Promise<void> {
  try {
    log('クリップボードを読みます…')
    handleResult(await exchange.pull())
  } catch (error) {
    const aborted = error instanceof UcpError && error.code === 'transport-aborted'
    log(aborted ? 'クリップボードの読み取りを拒否されました' : '読み取れませんでした', 'bad')
  }
}

async function nudgeIfWaiting(): Promise<void> {
  const pending = await store.latest(ideaListContract.ref)
  if (!pending || !el('result-card').hidden) return
  field('inbox').focus()
  log('戻ってきました。返信をここに貼り付けてください', 'warn')
}

exchange.listen(handleResult)

el('send').addEventListener('click', () => {
  void sendNow()
})

el('import').addEventListener('click', () => {
  void importFromInbox()
})

// 使えない端末では出さない。押せるのに必ず失敗するボタンは出さないほうがよい
el('pull').hidden = !capabilities.clipboardRead
el('pull').addEventListener('click', () => {
  void pullFromClipboard()
})

// 受信が起きたかどうかは console にだけ出す。
// 状態行に出すと、直後の取り込み結果と表示を奪い合ってしまう
document.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  console.debug(`[uweb-cp] 貼り付けを検知: ${text.length} 文字`)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void nudgeIfWaiting()
})

// 登録の成否は paste と同じ扱いにする。Share Target から起動したとき、登録の完了が
// 遅れて届いて取り込み結果の表示を奪っていた。失敗だけは残す (インストールが出来なくなる)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then(() => console.debug('[uweb-cp] Service Worker を登録した (インストール条件)'))
    .catch(() => log('Service Worker を登録できなかった', 'warn'))
}
