// Camera plus on-device pose model, shared by the coach and the physiotherapist's validation page.
// Everything is served from this origin (no CDN), and no frame ever leaves the device.
import type { Lm, Lm3 } from './core.ts'

const JOINTS: Record<string, number> = {
  left_shoulder: 11, right_shoulder: 12, left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16, left_hip: 23, right_hip: 24,
}

type Pt = { x: number; y: number; z?: number; visibility?: number }
export interface Pose { lm: Lm; world: Lm3 | null }
export interface Camera {
  /** A new pose when the video has a new frame since the last call, else null. `lm` is empty when nobody is in view. */
  detect(now: number): Pose | null
  aspect(): number
  stop(): void
}

export const CAMERA_DENIED = 'The camera is blocked or missing. Allow camera access, or use practice mode.'
export const isDenied = (e: unknown) => e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')

export async function openCamera(video: HTMLVideoElement, size: { w: number; h: number }, status: (s: string) => void = () => {}): Promise<Camera> {
  status('Opening the camera…')
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: size.w, height: size.h }, audio: false })
  const stop = () => stream.getTracks().forEach((t) => t.stop())
  try {
    video.srcObject = stream
    await video.play()
    status('Loading the pose model…')
    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate }, runningMode: 'VIDEO', numPoses: 1 })
    let landmarker: Awaited<ReturnType<typeof make>> | null = await make('GPU').catch(() => make('CPU'))
    let lastTs = 0, lastTime = -1
    return {
      detect(now) {
        if (!landmarker || video.readyState < 2 || video.currentTime === lastTime || now <= lastTs) return null
        lastTime = video.currentTime
        lastTs = now
        const res = landmarker.detectForVideo(video, now)
        const pts = res.landmarks?.[0] as Pt[] | undefined, wpts = res.worldLandmarks?.[0] as Pt[] | undefined
        if (!pts) return { lm: {}, world: null }
        const lm: Record<string, readonly [number, number, number]> = {}
        for (const [n, i] of Object.entries(JOINTS)) lm[n] = [pts[i].x, pts[i].y, pts[i].visibility ?? 0]
        let world: Lm3 | null = null
        if (wpts) {
          const w: Record<string, readonly [number, number, number, number]> = {}
          for (const [n, i] of Object.entries(JOINTS)) w[n] = [wpts[i].x, wpts[i].y, wpts[i].z ?? 0, pts[i].visibility ?? 0]
          world = w
        }
        return { lm, world }
      },
      aspect: () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : size.w / size.h),
      stop() {
        stop()
        landmarker?.close()
        landmarker = null // stop can run twice (finish, then effect teardown)
      },
    }
  } catch (e) {
    stop() // never leave the camera light on after a failure
    throw e
  }
}
