# NeuroMotion

Webcam coach for the **family caregiver** of a stroke survivor doing an arm-raise exercise. Spoken and written cues in English, Hindi and Marathi (Marathi is text-only unless a Marathi voice is installed). Runs fully on-device. Exports a FHIR R4 record the physiotherapist can review. **Research prototype: not a medical device, not validated, not for use on patients without physiotherapist supervision.**

**Why this exists.** India has under 0.6 physiotherapists per 10,000 people. The ATTEND trial (Lancet, 14 Indian hospitals) trained families to deliver rehab and did not beat usual care. One plausible reason, which is untested, is that caregivers get no feedback on whether a repetition is right or safe. ATTEND-2 (CMC Ludhiana) already offers an app-based upper-limb telerehab platform in India, so this is not "the first" of anything; no competitor search has been done yet.

## Web app

[site/](site/) is the NeuroMotion web app: a small Node server with sign-in (email code or Google) that serves a short scroll story (React Three Fiber, GSAP, Lenis); the **Coach**, where you pick a mode and age, choose from six upper-limb exercises, set sets, reps and rest, and the camera counts every repetition on your device (consent first, cues in English, Hindi and Marathi, prescription files, FHIR record); a **Progress** page that keeps sessions on the device with trends; and the privacy, clinical-review and validation pages. See [site/README.md](site/README.md) for build, test and deploy steps. The Python files in this folder are the original desktop prototype.

## Run (Windows)

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```
Put `pose_landmarker_lite.task` (from Google's `mediapipe-models` storage) in `models/`.
```bash
.venv\Scripts\python test_core.py
.venv\Scripts\python test_voice.py
.venv\Scripts\python test_text.py
.venv\Scripts\python test_consent.py
.venv\Scripts\python coach.py --side right --lang hi --target 90 --reps 5 --abha name@abdm
```
Seat the patient side-on to the camera with shoulder, elbow, wrist and hip all visible.
Keys: `y`/`n` on consent screens, `q` finish and save, `p` patient reports pain: coaching stops and the screen and voice tell them to rest and follow the physio's advice.

## What happens, in order

1. **Consent screen 1** (read aloud and shown): camera is used, only numbers are saved, the patient or guardian must agree, it is a practice aid not a doctor. **N exits before the camera opens** (tested).
2. **Consent screen 2**, only if `--abha` is given: share results with the physiotherapist under that ABHA address? N keeps the record unnamed.
3. Coaching. Cues appear on screen and are spoken when they change.
4. A FHIR Bundle is saved to `sessions/`.

## Design rules

- **SafeCue:** if any needed landmark has visibility under 0.6, the app says "reposition" and makes no movement judgment. State is frozen, not guessed.
- **Flags are not diagnoses.** Trunk lean over 15 deg or elbow under 150 deg marks a rep "possible compensation - for physiotherapist review".
- **Target angle is the physio's setting** (`--target`). The app never changes it.
- **Privacy:** no video or images are saved. The record names the patient only if screen 2 was accepted.
- **Voice is offline** (Windows OneCore voices). If no voice exists for the language, it stays silent instead of substituting another language.
- **FHIR:** per-rep Observations in a collection Bundle, with local codes. NOT validated against ABDM/NRCeS profiles.

## Known limits

- 2D image-plane angle only; camera angle changes the number. Needs a goniometer comparison before any accuracy claim. If error is above about 10 deg, drop the angle and keep rep counting.
- Not tested on stroke patients or hemiparetic posture. Spasticity, neglect or a painful shoulder could make the flags wrong.
- **All Hindi and Marathi cue and consent wording is an unreviewed draft** written by an AI. A native-speaking clinician must review it, and whoever signs off consent text must review the consent screens.
- Consent text is a draft, not legal advice. CDSCO medical-device status and DPDP Act obligations have not been checked.
- Windows only (GDI text rendering and OneCore voices). Single exercise: shoulder flexion.
- Live coaching with a person in frame has not been tried. Tests use synthetic landmarks and stubbed windows/sound; the voice test synthesizes audio but nobody has listened to it.

## Next, in order

1. Film yourself and a friend doing arm raises; compare the on-screen angle with a goniometer or protractor.
2. Physio checks cue wording and thresholds; native speakers review every Hindi/Marathi string.
3. With the physio present, 5-10 caregivers use the app versus a printed cue card; measure comprehension and agreement with the physio.
4. Competitor search, CDSCO and DPDP check, then ethics approval before any patient contact.
5. FHIR/ABDM mapping only once a clinician says they would read the record.
