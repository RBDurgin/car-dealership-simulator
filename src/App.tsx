import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'

export default function App() {
  return (
    <Canvas shadows="percentage">
      <Scene />
    </Canvas>
  )
}
