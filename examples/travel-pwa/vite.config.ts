import { shareTargetManifest } from 'uweb-cp/transports'
import { defineConfig } from 'vite-plus'

/**
 * GitHub Pages はサブパス (`/uweb-cp/`) で配信されるので、base を環境で切り替える。
 * ローカルは `/` のまま。
 */
const BASE = process.env.UWEB_CP_BASE ?? '/'

/** 受信側 (src/main.ts) と同じ値を使うこと。ずれると共有シートからの起動が無言で失敗する。 */
export const SHARE_TARGET = { action: BASE }

const manifest = {
  name: 'µweb-cp 旅行日程デモ',
  short_name: 'µweb-cp trip',
  description: 'チャット AI と旅行日程を往復させる検証用 PWA',
  start_url: BASE,
  scope: BASE,
  display: 'standalone',
  background_color: '#0f1117',
  theme_color: '#1c2a5e',
  icons: [
    { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  // manifest 側の params 名は受信実装と同じ場所から出す (ADR-0003)
  share_target: shareTargetManifest(SHARE_TARGET),
}

const body = JSON.stringify(manifest, null, 2)

/**
 * 実機検証は HTTPS トンネル越しに行うが、Vite は既定で未知の Host を 403 で弾く。
 * 先頭のドットはサブドメインを含む許可。検証用ドメインだけを通す。
 */
const TUNNEL_HOSTS = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt']

export default defineConfig({
  base: BASE,
  server: { allowedHosts: TUNNEL_HOSTS },
  preview: { allowedHosts: TUNNEL_HOSTS },

  plugins: [
    {
      name: 'uweb-cp-manifest',

      configureServer(server) {
        server.middlewares.use('/manifest.webmanifest', (_req, res) => {
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(body)
        })
      },

      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: body })
      },
    },
  ],
})
