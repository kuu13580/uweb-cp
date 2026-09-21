import {
  type Capabilities,
  createExchange,
  createLocalStorageStore,
  detectCapabilities,
  type Extraction,
  recommendTransports,
  type Result,
  type SendInput,
} from 'uweb-cp'
import { type Itinerary, itineraryContract } from './contract'

// --- DOM の取り回し -----------------------------------------------------------

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`#${id} が無い`)
  return found
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

function log(message: string, kind: 'ok' | 'warn' | 'bad' | '' = ''): void {
  const line = document.createElement('li')
  line.className = kind
  line.textContent = `${new Date().toLocaleTimeString('ja-JP')}  ${message}`
  el('log').prepend(line)
}

// --- 環境の見える化 -----------------------------------------------------------

function renderCapabilities(capabilities: Capabilities): void {
  const recommended = recommendTransports(capabilities)
  const rows: Array<[string, string, boolean]> = [
    ['navigator.share', String(capabilities.webShare), capabilities.webShare],
    ['clipboard.writeText', String(capabilities.clipboardWrite), capabilities.clipboardWrite],
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
      state.className = good ? 'yes' : 'no'
      row.append(label, state)
      return row
    }),
  )
}

// --- 取り込み結果の描画 -------------------------------------------------------

/** data は LLM 由来なので、文字列は必ず textContent として置く。 */
function renderItinerary(itinerary: Itinerary): void {
  const heading = document.createElement('p')
  const destination = document.createElement('strong')
  destination.textContent = itinerary.destination
  heading.append(destination)
  if (itinerary.summary) {
    const summary = document.createElement('span')
    summary.className = 'note'
    summary.textContent = ` — ${itinerary.summary}`
    heading.append(summary)
  }

  const days = itinerary.days.map((day) => {
    const section = document.createElement('div')
    section.className = 'day'

    const title = document.createElement('h3')
    title.textContent = `Day ${day.day}${day.date ? ` (${day.date})` : ''} — ${day.title}`

    const list = document.createElement('ul')
    for (const stop of day.stops) {
      const item = document.createElement('li')
      if (stop.time) {
        const time = document.createElement('time')
        time.textContent = stop.time
        item.append(time)
      }
      item.append(stop.place)
      if (stop.note) {
        const note = document.createElement('span')
        note.className = 'note'
        note.textContent = ` — ${stop.note}`
        item.append(note)
      }
      list.append(item)
    }

    section.append(title, list)
    return section
  })

  el('result').replaceChildren(heading, ...days)
  el('result-card').hidden = false
}

// --- 本体 ---------------------------------------------------------------------

const capabilities = detectCapabilities()
renderCapabilities(capabilities)
log(`起動。送信は ${recommendTransports(capabilities).outbound[0] ?? 'なし'} を試します`)

// 受信の挙動は emit に依らないので、応答待ちの store だけ共有して 2 つ持つ。
// 実機で両モードを比べられるようにするための、このデモ固有の作り。
const store = createLocalStorageStore()
const exchanges = {
  now: createExchange({ contract: itineraryContract, locale: 'ja', store, emit: 'now' }),
  'on-approval': createExchange({
    contract: itineraryContract,
    locale: 'ja',
    store,
    emit: 'on-approval',
  }),
}

const selected = () => exchanges[field('emit').value === 'now' ? 'now' : 'on-approval']

function currentInput(): SendInput {
  const instruction = field('instruction').value.trim()
  const departureDate = field('date').value

  return {
    ...(instruction ? { instruction } : {}),
    context: {
      destination: field('destination').value,
      nights: Number(field('nights').value),
      ...(departureDate ? { departureDate } : {}),
    },
  }
}

async function sendNow(): Promise<void> {
  const send = button('send')
  send.disabled = true

  try {
    const { via, rid, prompt, approvalPhrase } = await selected().send(currentInput())
    log(`送信した: via=${via} rid=${rid} (${prompt.length} 文字)`, 'ok')
    if (via === 'clipboard') log('クリップボードに入れました。AI に貼り付けてください', 'warn')
    if (approvalPhrase) {
      log(`内容を詰めたら AI に「${approvalPhrase}」と送ると封筒が出ます`, 'warn')
    }
  } catch (error) {
    log(`送信できなかった: ${error instanceof Error ? error.message : String(error)}`, 'bad')
  } finally {
    send.disabled = false
  }
}

el('send').addEventListener('click', () => {
  void sendNow()
})

el('toggle-preview').addEventListener('click', () => {
  const pane = el('preview')
  pane.hidden = !pane.hidden
  if (!pane.hidden) pane.textContent = selected().preview(currentInput())
})

function handleResult(result: Result<Extraction<Itinerary>>): void {
  if (result.ok) {
    const { envelope, via, issues } = result.value
    log(`取り込んだ: via=${via} rid=${envelope.rid ?? 'なし'}`, 'ok')
    for (const issue of issues) log(`注意: ${issue.message}`, 'warn')
    renderItinerary(envelope.data)
    return
  }

  log(`取り込めなかった (${result.code})`, 'bad')
  for (const issue of result.issues) log(`  ${issue.message}`, 'bad')
}

// 受信は emit に依らないので片方だけ張れば足りる
exchanges.now.listen(handleResult)

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
  handleResult(await exchanges.now.accept(text))
}

el('import').addEventListener('click', () => {
  void importFromInbox()
})

// 診断用: 受信そのものが起きているかを、解釈の成否と切り離して見せる
document.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  log(`貼り付けを検知: ${text.length} 文字`)
})

const drop = el('drop')
for (const type of ['dragenter', 'dragover'] as const) {
  drop.addEventListener(type, (event) => {
    event.preventDefault()
    drop.classList.add('over')
  })
}
for (const type of ['dragleave', 'drop'] as const) {
  drop.addEventListener(type, () => drop.classList.remove('over'))
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => log('Service Worker を登録した (インストール条件)'))
    .catch(() => log('Service Worker を登録できなかった', 'warn'))
}
