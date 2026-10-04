import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    <>
      <Canvas shadows="percentage">
        <Scene />
      </Canvas>
      <HUD />
    </>
  )
}
