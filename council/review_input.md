# Council question

A student (India) with access to a physiotherapist built "Caregiver Coach", a Python/MediaPipe webcam prototype. A family caregiver of a stroke survivor points a laptop/phone camera at the patient doing a shoulder-flexion arm raise. The app computes 2D shoulder-flexion angle, counts reps, flags possible compensation (trunk lean >15 deg, elbow <150 deg) "for physio review", gives text cues in English/Hindi/Marathi, gates feedback on landmark visibility >=0.6, has a pain-stop key, saves no video, and exports per-rep FHIR R4 Observations. Tested only with synthetic unit tests; never tried on a real person or stroke patient; angles not validated against a goniometer; Hindi/Marathi wording written by AI, unreviewed. Evidence: India <0.6 physios/10,000; ATTEND trial found family-led rehab did NOT beat usual care (hypothesis: no quality feedback); ATTEND-2 (CMC Ludhiana) already exists as an app-based upper-limb telerehab platform. "Nobody builds this" is unverified.

QUESTION: Is "AI feedback coach for the caregiver, in regional languages, with an ABDM/FHIR-shaped record" the right innovation direction, and what should the student do next? Stakes: months of effort, hackathon/research/startup use, patient safety.

---

**Response A:**
Reading this cold, three things jump out.

1. The pitch carries jargon the user finds obvious and a stranger doesn't. "ABDM/FHIR-shaped record" is a feature description, not a reason to exist. Who reads that record? If nobody yet, a third of the pitch is plumbing. A caregiver in Pune doesn't want a Bundle; they want to know "am I doing this right?"

2. The core logic is a leap. ATTEND found family-led rehab didn't beat usual care, and the hypothesis is that caregivers lack feedback. That is a guess, not a finding. The tool gives feedback on one exercise using a 2D webcam angle. Nothing shows better arm-raise angles are what was missing. Adherence, dosage, or poor instruction could explain it, and a posture checker fixes none of them.

3. Never watched one real person use it. Synthetic tests prove the code runs, not that it is useful or safe. Telling a frail stroke survivor's relative "good, keep going" off an unvalidated angle, with unreviewed Hindi, is the actual risk.

Next: stop building features. Have the physio check angles against a goniometer on healthy volunteers. Get a native Hindi/Marathi speaker, ideally the physio, to review every string. Do a 5-10 caregiver observation session supervised by the physio and watch where they get confused. Spend a week searching for competitors beyond ATTEND-2. Freeze real-patient use until the physio signs off. Hackathon demo: fine now, labelled prototype. Research or startup claim: not yet.

**Response B:**
The direction is plausible. The prototype and the plan around it have fatal gaps.

1. The core premise is untested. ATTEND's failure is a hypothesis. Caregiver burden, poor adherence, wrong dose, no progression of exercises, and patients who don't want to be drilled by family fit just as well. A camera telling the caregiver a rep count and angle may not change outcomes at all.

2. The novelty claim is unverified and ATTEND-2 already sits in the same space. The student competes with CMC Ludhiana, an established team with clinical access. Check rivals (Indian rehab startups, MediaPipe-based physio apps such as Kaia, SWORD, PhysioTrack) before investing more months.

3. The measurement is shaky. A 2D webcam angle is not shoulder flexion. Camera angle, a seated or bedbound patient, a hemiparetic body, a trunk that already leans all distort it. MediaPipe is trained on healthy bodies, and visibility >=0.6 says nothing about accuracy. Wheelchairs, blankets and a paretic limb will break it. The compensation flags are guesses until validated.

4. Safety is the biggest problem. A lay caregiver reading "good form" can push a patient with a painful hemiplegic shoulder, subluxation or spasticity. The pain-stop key does nothing if the caregiver ignores it. Unreviewed AI-written Hindi/Marathi coaching text is a clinical-communication risk.

5. FHIR/ABDM is premature polish. Observations nobody consumes do not count as innovation.

Next: two weeks of literature and competitor checks. Goniometer validation on 10 healthy volunteers, then 5-10 patients under physio supervision with ethics approval. Physio sign-off on cues, native-speaker review. Do not give it to real caregivers before then. Drop ABDM work until a clinician wants the data.

**Response C:**
Direction: yes, but only as a narrow, checkable pilot. Right now it is a demo, not a product.

Monday: stop adding features. Nothing has touched a real body. Film yourself and a friend doing arm raises in front of the app. Compare its angle readout against a phone goniometer app or a protractor on a printed photo. If error is above about 10 degrees from a single 2D webcam view, fix that or drop the angle number and keep only rep counting.

This week: (1) Show the physio the demo and ask which three cues they would actually say to a caregiver and whether they accept the 15 and 150 degree thresholds. Their answers replace guessed numbers. (2) Get a Hindi and a Marathi speaker to review every string; unreviewed AI-written health wording is a defect fixable in an afternoon. (3) Spend one day searching competitors: ATTEND-2 app, Google Play, arXiv/PubMed for "caregiver" + "pose" + "stroke". Do this before claiming novelty.

Weeks 2-6: supervised session with the physio in the room, 5-10 healthy volunteers first. Then, only if the physio agrees and college ethics approves, stroke patients with the physio present. Measure caregiver comprehension of cues and agreement between app flags and the physio's judgement. Claim no clinical outcomes.

Safety: don't hand it to a family alone. Label it a practice aid, not a diagnosis, keep the pain-stop key.

FHIR/ABDM: last. It gets hackathon points but does nothing for patients until coaching works.

Hackathon pitch you can defend today: a prototype validated against a goniometer plus a physio-reviewed cue set. Don't pitch a deployed product.

**Response D:**
The direction is right, but framed too small. Don't treat it as "a webcam app for one arm raise." The real asset is a quality-feedback layer for unsupervised family-led rehab. ATTEND's failure is the opening: nobody checked the quality of what caregivers did. Whoever fixes that sells the missing ingredient for the whole task-shifting model. India can't train its way out of <0.6 physios per 10,000, so the caregiver is the only scalable workforce.

Upside:
1. Position as the caregiver quality-feedback layer, not a standalone app. ATTEND-2 and similar platforms are distribution partners, not rivals. A language-localised, ABDM-shaped feedback module is something they could plug in. The unverified "nobody builds this" claim matters less if the student becomes the component others adopt.
2. The FHIR/ABDM record is the sleeper asset. Per-rep Observations give the physio a compliance and quality dashboard, which telerehab billing, insurer reimbursement and outcomes research need. The data may be more valuable than the cues.
3. The same engine extends to other joints, post-op orthopaedic patients, Parkinson's, elderly falls prevention; and from Hindi/Marathi to Tamil, Bengali, Telugu where supply is scarcest.
4. A research paper and a hackathon pitch both come out of it. Phase one is a cheap, publishable goniometer validation study that gives credibility.

Next: validate angles against a goniometer on 10-20 healthy volunteers with the physio; physio and native speakers review wording; supervised pilot with 5-10 caregivers; write up validation; pitch the module to ATTEND-2 and the CMC team.

**Response E:**
You are asking the wrong question. "Is this the right innovation direction?" assumes the product is the unit of value. The real question: what is the smallest thing that would make a stroke survivor's recovery measurably better, and does a camera app do that?

Start from ATTEND. Family-led rehab didn't beat usual care. The proposed cause, no quality feedback, is a hypothesis, not a finding. Caregivers may also lack time, training, motivation, or an exercise prescription that fits the patient. Angle feedback fixes only one of these. You are building the solution before testing the diagnosis.

Assumptions in the prototype: (1) feedback on shoulder-flexion angle improves outcomes - unproven. (2) A 2D webcam angle is accurate enough on a hemiparetic, compensating body - unvalidated, and 2D flexion is fragile. (3) A caregiver can act on "elbow <150" or "trunk lean" - untested with a single real caregiver. (4) FHIR/ABDM output is a need - nobody has asked for it; it is decoration until a clinician says they'd read it.

The ABDM/FHIR layer is the least important part and it is what makes the project look finished. Drop it for now. Also drop the "no one builds this" claim until you have searched.

Run the cheapest experiment that could kill the idea. Use the physio: 5-10 healthy volunteers do raises while a goniometer reads the angle; compare with the app. Then watch 3-5 caregivers use it with the physio present and ask whether the cue changed what they did. Hindi and Marathi wording gets reviewed by a native-speaking clinician. Until that works, treat it as a research demo. No real stroke patients, no safety claims.
