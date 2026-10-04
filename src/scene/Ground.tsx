export function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[40, 30]} />
      <meshStandardMaterial color="#6f8f5a" />
    </mesh>
  )
}
