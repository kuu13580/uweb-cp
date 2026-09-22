import { callMethod, getProp } from '../../reflect'
import type { InboundHandler, InboundTransport } from '../types'

// Without this the browser opens the file and drop never fires
const onDragOver = (event: Event) => event.preventDefault()

/** Receiving a dragged-and-dropped text file. A desktop convenience. */
export function fileDropTransport(target: EventTarget): InboundTransport {
  return {
    id: 'file-drop',

    start(handler) {
      const onDrop = (event: Event) => {
        event.preventDefault()
        void deliver(event, handler)
      }

      target.addEventListener('dragover', onDragOver)
      target.addEventListener('drop', onDrop)

      return () => {
        target.removeEventListener('dragover', onDragOver)
        target.removeEventListener('drop', onDrop)
      }
    },
  }
}

async function deliver(event: Event, handler: InboundHandler): Promise<void> {
  const text = await droppedText(event)
  if (text) handler(text, { source: 'file-drop' })
}

/** Prefers dropped selection text, falling back to reading the first file. */
async function droppedText(event: Event): Promise<string | undefined> {
  const transfer = getProp(event, 'dataTransfer')

  const plain = callMethod(transfer, 'getData', ['text/plain'])
  if (typeof plain === 'string' && plain.length > 0) return plain

  const files = getProp(transfer, 'files')
  const file = getProp(files, '0')
  const contents = callMethod(file, 'text', [])
  if (!(contents instanceof Promise)) return undefined

  const resolved: unknown = await contents
  return typeof resolved === 'string' && resolved.length > 0 ? resolved : undefined
}
