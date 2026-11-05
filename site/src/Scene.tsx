import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { S, setRender } from './driver'

const GROUND = '#0a0b0f'
const AMBER = new THREE.Color('#f2a33a')
const RED = new THREE.Color('#ff4d4d')
const GREEN = new THREE.Color('#5bd6a0')
const MUTED = new THREE.Color('#8a8f9c')
const D2R = Math.PI / 180
const TRUNK = 2.2, UPPER = 1.5, FORE = 1.3, R = 1.15, N_DOTS = 91

// The colour of the moment: amber while moving, green at target, red when the coach would flag it.
const signal = new THREE.Color(AMBER)

function Body() {
  const jitter = useRef<THREE.Group>(null!)
  const lean = useRef<THREE.Group>(null!)
  const arm = useRef<THREE.Group>(null!)
  const fore = useRef<THREE.Group>(null!)
  const dots = useRef<THREE.InstancedMesh>(null!)
  const mark = useRef<THREE.MeshBasicMaterial>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const limb = useMemo(() => new THREE.MeshStandardMaterial({ color: '#171a22', emissive: AMBER, emissiveIntensity: 1.5, roughness: 0.4, metalness: 0.2, transparent: true }), [])
  const joint = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: AMBER, emissiveIntensity: 2.4, transparent: true }), [])
  const trunk = useMemo(() => new THREE.MeshStandardMaterial({ color: '#12141b', emissive: '#2a2f3d', emissiveIntensity: 0.7, roughness: 0.7, transparent: true }), [])
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }), [])

  useFrame((_, dt) => {
    const f = 1 - Math.exp(-dt * 8)
    signal.lerp(S.flag ? RED : S.ok ? GREEN : AMBER, f)
    limb.emissive.copy(signal)
    joint.emissive.copy(signal)
    dotMat.color.copy(signal)
    light.current.color.copy(signal)

    // SafeCue: low visibility ghosts and flickers the body instead of pretending to see it.
    const seen = Math.min(1, Math.max(0.16, (S.vis - 0.2) / 0.6))
    const flicker = 1 - (1 - S.vis) * 0.7 * (0.5 + 0.5 * Math.sin(S.idle * 33))
    const op = seen * flicker
    limb.opacity = op
    joint.opacity = op
    limb.emissiveIntensity = 1.5 * op * op // glow fades faster than opacity, so bloom cannot hide the ghosting
    joint.emissiveIntensity = 2.4 * op * op
    trunk.opacity = 0.35 + 0.55 * op
    jitter.current.position.set(Math.sin(S.idle * 41) * 0.05 * (1 - S.vis), Math.cos(S.idle * 37) * 0.04 * (1 - S.vis), 0)

    lean.current.rotation.z = -S.lean * D2R
    arm.current.rotation.z = S.angle * D2R
    fore.current.rotation.z = S.bend * D2R
    mark.current.color.copy(S.angle >= 89 && !S.flag ? GREEN : MUTED)

    for (let i = 0; i < N_DOTS; i++) {
      const a = i * 2
      const on = a <= S.angle
      const lead = Math.abs(a - S.angle) < 2.5
      dummy.position.set(Math.sin(a * D2R) * R, -Math.cos(a * D2R) * R, 0)
      dummy.scale.setScalar(on ? (lead ? 0.085 : 0.032) : 0.0001)
      dummy.updateMatrix()
      dots.current.setMatrixAt(i, dummy.matrix)
    }
    dots.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={jitter}>
      <group ref={lean}>
        <mesh position={[0, TRUNK / 2, 0]} material={trunk}>
          <capsuleGeometry args={[0.17, TRUNK - 0.34, 8, 20]} />
        </mesh>
        <mesh position={[0, TRUNK + 0.62, 0]}>
          <icosahedronGeometry args={[0.3, 1]} />
          <meshBasicMaterial color="#5a6072" wireframe toneMapped={false} />
        </mesh>
        <mesh material={joint}>
          <sphereGeometry args={[0.15, 24, 24]} />
        </mesh>

        <group position={[0, TRUNK, 0]}>
          <pointLight ref={light} intensity={9} distance={9} decay={2} />
          <instancedMesh ref={dots} args={[undefined, undefined, N_DOTS]} material={dotMat} frustumCulled={false}>
            <sphereGeometry args={[1, 8, 8]} />
          </instancedMesh>
          <mesh position={[R + 0.22, 0, 0]}>
            <boxGeometry args={[0.5, 0.03, 0.03]} />
            <meshBasicMaterial ref={mark} color="#8a8f9c" toneMapped={false} />
          </mesh>
          <mesh material={joint}>
            <sphereGeometry args={[0.15, 24, 24]} />
          </mesh>

          <group ref={arm}>
            <mesh position={[0, -UPPER / 2, 0]} material={limb}>
              <capsuleGeometry args={[0.085, UPPER - 0.17, 8, 20]} />
            </mesh>
            <group position={[0, -UPPER, 0]}>
              <mesh material={joint}>
                <sphereGeometry args={[0.13, 24, 24]} />
              </mesh>
              <group ref={fore}>
                <mesh position={[0, -FORE / 2, 0]} material={limb}>
                  <capsuleGeometry args={[0.07, FORE - 0.14, 8, 20]} />
                </mesh>
                <mesh position={[0, -FORE, 0]} material={joint}>
                  <sphereGeometry args={[0.11, 24, 24]} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function Floor() {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const mats = useMemo(
    () => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: MUTED, transparent: true, side: THREE.DoubleSide, toneMapped: false })),
    [],
  )
  useFrame(() => {
    mats.forEach((m, i) => {
      const phase = (S.idle * 0.12 + i / 3) % 1
      rings.current[i]?.scale.setScalar(1 + phase * 2.4)
      m.opacity = 0.4 * (1 - phase) * (1 - phase)
      m.color.copy(signal)
    })
  })
  return (
    <group rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
      {mats.map((m, i) => (
        <mesh key={i} ref={(el) => { rings.current[i] = el }} material={m}>
          <ringGeometry args={[1.5, 1.54, 96]} />
        </mesh>
      ))}
      <mesh>
        <ringGeometry args={[1.18, 1.2, 96]} />
        <meshBasicMaterial color="#2a2f3d" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null!)
  const pos = useMemo(() => {
    const a = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 13
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      a[i * 3] = r * Math.sin(ph) * Math.cos(th)
      a[i * 3 + 1] = r * Math.cos(ph) * 0.6 + 2.5
      a[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
    }
    return a
  }, [count])
  useFrame(() => {
    ref.current.rotation.y = S.idle * 0.012 + S.p * 1.6 // scroll also turns the room
    ref.current.position.y = -S.p * 1.5
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8a8f9c" size={0.045} sizeAttenuation transparent opacity={0.65} depthWrite={false} />
    </points>
  )
}

function Rig({ portrait }: { portrait: boolean }) {
  useFrame(({ camera }) => {
    const p = S.p
    const dist = (portrait ? 10.5 : 8) - 0.9 * Math.sin(p * Math.PI) + Math.sin(S.idle * 0.25) * 0.12
    const az = -0.5 + p + Math.sin(S.idle * 0.2) * 0.03
    const y = portrait ? 0.9 : 1.55 // the body sits in the middle of its frame
    camera.position.set(Math.sin(az) * dist, y + 0.4 + Math.sin(p * Math.PI) * 0.6, Math.cos(az) * dist)
    camera.lookAt(0, y, 0)
  })
  return null
}

function World() {
  const portrait = useThree((s) => s.size.width / s.size.height < 0.9)
  const setDpr = useThree((s) => s.setDpr)
  const [slow, setSlow] = useState(false)
  const wide = useThree((s) => s.size.width > 900) && !slow
  const probe = useRef({ t: 0, n: 0 })
  useEffect(() => () => setRender(null), [])

  // Adaptive quality: if frames average over 40 ms for 1.5 s, drop bloom and render at 1x pixel density.
  useFrame((_, dt) => {
    if (slow) return
    const p = probe.current
    if (++p.n < 12) return // warm-up frames do not count
    p.t += dt
    if (p.t > 1.5) {
      if (p.t / (p.n - 11) > 0.04) {
        setSlow(true)
        setDpr(1)
      }
      p.t = 0
      p.n = 11
    }
  })
  return (
    <>
      <color attach="background" args={[GROUND]} />
      <fog attach="fog" args={[GROUND, 14, 30]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <Rig portrait={portrait} />
      <group scale={portrait ? 0.68 : 1}>
        <Body />
        <Floor />
      </group>
      <Dust count={wide ? 1400 : 600} />
      {wide && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.85} luminanceThreshold={0.25} luminanceSmoothing={0.4} mipmapBlur />
          <Vignette offset={0.25} darkness={0.75} />
        </EffectComposer>
      )}
    </>
  )
}

export default function Scene() {
  return (
    <Canvas
      frameloop="never"
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 60, position: [0, 2, 10] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        setRender((ms) => state.advance(ms))
        window.dispatchEvent(new Event('scene-ready'))
      }}
    >
      <World />
    </Canvas>
  )
}
