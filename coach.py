"""NeuroMotion: webcam app. Keys: q = finish and save, p = patient reports pain/discomfort -> stop.

Nothing but numbers is stored. No video or images are written to disk.
"""
import argparse
import json
import os
from datetime import datetime

import cv2
import mediapipe as mp

import textdraw
from core import CONSENT, CUES, RepCounter, fhir_bundle, measure
from voice import Speaker

JOINTS = {"left_shoulder": 11, "right_shoulder": 12, "left_elbow": 13, "right_elbow": 14,
          "left_wrist": 15, "right_wrist": 16, "left_hip": 23, "right_hip": 24}
BAD = {"reposition", "lean", "elbow", "stop"}
RED, GREEN = (180, 0, 0), (0, 130, 0)  # RGB


def banner(frame, text, rgb):
    strip = textdraw.render(text, frame.shape[1], fg=(255, 255, 255), bg=rgb)
    frame[-strip.shape[0]:] = strip
    return frame


def ask_consent(text, speaker, key):
    """Full-screen yes/no. Spoken as well as written, for caregivers who read slowly or not at all."""
    canvas = textdraw.render(text, 900, fg=(235, 235, 235), bg=(24, 28, 36))
    speaker.say(key, text)
    while True:
        cv2.imshow("NeuroMotion", canvas)
        k = cv2.waitKey(100) & 0xFF
        if k in (ord("y"), ord("Y")):
            return True
        if k in (ord("n"), ord("N"), 27):
            return False


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--side", choices=["left", "right"], default="right", help="arm being exercised")
    a.add_argument("--lang", choices=list(CUES), default="en")
    a.add_argument("--target", type=float, default=90, help="target shoulder flexion in degrees (set by the physiotherapist)")
    a.add_argument("--reps", type=int, default=10)
    a.add_argument("--camera", type=int, default=0)
    a.add_argument("--abha", help="ABHA address; written only if the patient agrees on the second consent screen")
    a.add_argument("--out", default="sessions")
    a.add_argument("--model", default="models/pose_landmarker_lite.task")
    args = a.parse_args()

    if not os.path.exists(args.model):
        raise SystemExit(f"Pose model not found at {args.model} - see README step 2")
    speaker = Speaker(args.lang)
    if not speaker.available:
        print(f"No offline '{args.lang}' voice installed: cues are text-only.")
    # Consent comes before the camera opens: no consent, no frames processed.
    if not ask_consent(CONSENT[args.lang]["use"], speaker, "consent_use"):
        cv2.destroyAllWindows()
        raise SystemExit("Consent not given. Nothing was recorded.")
    shared = bool(args.abha) and ask_consent(CONSENT[args.lang]["share"].format(abha=args.abha), speaker, "consent_share")
    speaker.reset()
    counter = RepCounter(target=args.target)
    pose =mp.tasks.vision.PoseLandmarker.create_from_options(mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=args.model),
        running_mode=mp.tasks.vision.RunningMode.VIDEO))
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open camera {args.camera}")
    stopped, tick = False, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = pose.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), tick)
        tick += 33
        m = None
        if res.pose_landmarks:
            pts = res.pose_landmarks[0]
            lm = {n: (pts[i].x, pts[i].y, pts[i].visibility) for n, i in JOINTS.items()}
            m = measure(lm, args.side)
            h, w = frame.shape[:2]
            px = {n: (int(x * w), int(y * h)) for n, (x, y, _) in lm.items()}
            for p, q in [("shoulder", "elbow"), ("elbow", "wrist"), ("shoulder", "hip")]:
                cv2.line(frame, px[f"{args.side}_{p}"], px[f"{args.side}_{q}"], (0, 255, 0), 3)
            for pt in px.values():
                cv2.circle(frame, pt, 5, (255, 255, 0), -1)
        cue = "stop" if stopped else counter.update(m)
        speaker.say(cue, CUES[args.lang][cue])
        hud = f"Reps {len(counter.reps)}/{args.reps}  Target {args.target:.0f}  " + (f"Angle {m['flexion']:.0f}" if m else "Angle --")
        cv2.putText(frame, hud, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        frame = banner(frame, CUES[args.lang][cue], RED if cue in BAD else GREEN)
        cv2.imshow("NeuroMotion", frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("p"):
            stopped = True  # discomfort: stop coaching, hand over to clinician guidance
        if k == ord("q") or len(counter.reps) >= args.reps:
            break
    cap.release()
    cv2.destroyAllWindows()

    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, datetime.now().strftime("session-%Y%m%d-%H%M%S.fhir.json"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(fhir_bundle(counter.reps, args.side, args.target, args.abha, shared), f, indent=2, ensure_ascii=False)
    done = sum(r.reached_target for r in counter.reps)
    print(f"{len(counter.reps)} reps, {done} reached target, {sum(r.flagged for r in counter.reps)} flagged for physio review -> {path}")


if __name__ == "__main__":
    main()
