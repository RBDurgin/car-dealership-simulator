import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/** How often the count is refreshed, in seconds. */
const REFRESH = 0.5

/**
 * The last frame's draw calls (shadow passes included), shown under the `?fps`
 * meter, so a phone can be checked without a console. A plain DOM label,
 * updated a couple of times a second, outside React.
 */
export function DrawCalls() {
  const gl = useThree((s) => s.gl)
  const label = useRef<HTMLDivElement | null>(null)
  const since = useRef(0)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'draw-calls'
    document.body.appendChild(el)
    label.current = el
    return () => {
      el.remove()
      label.current = null
    }
  }, [])

  // Read before this frame renders, so it's the whole of the last one.
  useFrame((_, delta) => {
    since.current += delta
    if (since.current < REFRESH || !label.current) return
    since.current = 0
    const { calls, triangles } = gl.info.render
    label.current.textContent = `${calls} calls · ${Math.round(triangles / 1000)}k tris`
  })

  return null
}
