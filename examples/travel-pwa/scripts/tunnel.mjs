// 実機検証用に、ビルド → preview → HTTPS トンネル までを一息で立ち上げる。
//
// 共有シート / Service Worker / PWA インストールはいずれも secure context 限定で、
// LAN 越しの http://192.168.x.x では確かめられない。そのための HTTPS 出口。
//
// 使い方: node scripts/tunnel.mjs [port]

import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import qrcode from 'qrcode-terminal'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2] ?? 4173)

const CLOUDFLARED_CANDIDATES = [
  process.env.CLOUDFLARED,
  join(process.env.HOME ?? '', '.local', 'bin', 'cloudflared'),
  '/usr/local/bin/cloudflared',
  '/usr/bin/cloudflared',
  'cloudflared',
].filter(Boolean)

const children = []
let stopping = false

function die(message) {
  console.error(`\n✗ ${message}\n`)
  stop(1)
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: APP_DIR, ...options })
  children.push(child)
  return child
}

function findCloudflared() {
  for (const candidate of CLOUDFLARED_CANDIDATES) {
    if (candidate === 'cloudflared') return candidate
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // 次の候補へ
    }
  }
  return undefined
}

function build() {
  return new Promise((resolve) => {
    console.log('▸ ビルド中…')
    const child = run('pnpm', ['run', 'build'], { stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code !== 0) die('ビルドに失敗しました。先に `vp run -r build` を通してください')
      resolve()
    })
  })
}

// vite も cloudflared も URL の途中に色指定を挟むので、素のテキストに戻してから探す
const ANSI = /\[[0-9;]*m/g

/** 出力を 1 行ずつ見て、待っているパターンが出たら解決する。 */
function waitForLine(child, pattern, label) {
  return new Promise((resolve) => {
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (raw) => {
        const line = raw.replace(ANSI, '')
        const match = pattern.exec(line)
        if (match) resolve(match[0])
        else if (process.env.DEBUG) console.log(`  [${label}] ${line}`)
      })
    }
    child.on('exit', (code) => die(`${label} が終了しました (code ${code})`))
  })
}

async function main() {
  const cloudflared = findCloudflared()
  if (!cloudflared) {
    die(
      'cloudflared が見つかりません。次のどちらかで入れてください:\n' +
        '  curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/.local/bin/cloudflared\n' +
        '  brew install cloudflared',
    )
  }

  await build()

  console.log(`▸ preview を :${PORT} で起動…`)
  const preview = run('pnpm', [
    'exec',
    'vp',
    'preview',
    '--port',
    String(PORT),
    '--host',
    '127.0.0.1',
  ])
  await waitForLine(preview, /http:\/\/127\.0\.0\.1:\d+/, 'preview')

  console.log('▸ トンネルを開通…')
  const tunnel = run(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${PORT}`])
  const url = await waitForLine(tunnel, /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 'cloudflared')

  console.log(`\n  ${url}\n`)
  qrcode.generate(url, { small: true })
  console.log(
    [
      '',
      '  スマホでこの QR を読むか、URL を開いてください。',
      '',
      '  ※ この URL は起動のたびに変わります。URL が変わるとオリジンも変わるので、',
      '    インストール済み PWA と Share Target の登録はやり直しになります。',
      '',
      '  止めるときは Ctrl-C。',
      '',
    ].join('\n'),
  )
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)))
