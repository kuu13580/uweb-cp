// PWA のインストール条件を満たすためだけのアイコン生成。
// 画像を1枚もリポジトリに持ち込まずに済むよう、その場でラスタライズして PNG を書く。
// 使い方: node scripts/make-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x1c, 0x2a, 0x5e]
const FG = [0xff, 0xff, 0xff]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function png(size, shade) {
  // 各行の先頭にフィルタ種別 0 を置いた生のスキャンラインを deflate する
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, y / size)
      raw[at++] = r
      raw[at++] = g
      raw[at++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 右向き・左向きの矢印を上下に重ねた「往復」のしるし。 */
function arrow(u, v, centerY, pointsRight) {
  const x = pointsRight ? u : 1 - u
  const dy = Math.abs(v - centerY)

  const shaft = x >= 0.26 && x <= 0.6 && dy <= 0.038
  const head = x > 0.6 && x <= 0.74 && dy <= 0.1 * (1 - (x - 0.6) / 0.14)
  return shaft || head
}

function pixel(u, v) {
  return arrow(u, v, 0.4, true) || arrow(u, v, 0.6, false) ? FG : BG
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, png(size, pixel))
  console.log(`wrote ${file}`)
}
