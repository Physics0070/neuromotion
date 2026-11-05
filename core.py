"""NeuroMotion core: pure logic, no camera.

Landmarks: dict name -> (x, y, visibility), image coords (y grows downward).
Names: "<left|right>_<shoulder|elbow|wrist|hip>".
Angles are 2D image-plane estimates, not goniometer readings.
"""
import math
from dataclasses import dataclass
from datetime import datetime, timezone

MIN_VIS = 0.6  # SafeCue: below this we make no movement judgment at all

CUES = {
    "en": {
        "ready": "Ready. Raise the arm forward and up.",
        "reposition": "Move back or turn so the whole arm and body are visible.",
        "raise": "Raise the arm slowly.",
        "higher": "A little higher.",
        "good": "Good! Now lower slowly.",
        "lean": "Stop - body is leaning. Sit straight and try again.",
        "elbow": "Keep the elbow straight.",
        "rep_done": "One repetition done.",
        "stop": "STOP. Rest and follow your physiotherapist's advice.",
    },
    "hi": {
        "ready": "तैयार। हाथ को आगे से ऊपर उठाइए।",
        "reposition": "पीछे हटें या मुड़ें ताकि पूरा हाथ और शरीर दिखे।",
        "raise": "हाथ को धीरे-धीरे ऊपर उठाइए।",
        "higher": "थोड़ा और ऊपर।",
        "good": "बहुत अच्छा! अब धीरे-धीरे नीचे लाइए।",
        "lean": "रुकिए - शरीर झुक रहा है। सीधे बैठें और फिर से करें।",
        "elbow": "कोहनी सीधी रखिए।",
        "rep_done": "एक बार पूरा हुआ।",
        "stop": "रुकिए। आराम करें और फिज़ियोथेरेपिस्ट की सलाह मानें।",
    },
    "mr": {
        "ready": "तयार. हात पुढून वर उचला.",
        "reposition": "मागे सरका किंवा वळा, म्हणजे पूर्ण हात आणि शरीर दिसेल.",
        "raise": "हात हळूहळू वर उचला.",
        "higher": "थोडे आणखी वर.",
        "good": "छान! आता हळूहळू खाली आणा.",
        "lean": "थांबा - शरीर वाकत आहे. सरळ बसा आणि पुन्हा करा.",
        "elbow": "कोपर सरळ ठेवा.",
        "rep_done": "एक वेळ पूर्ण झाले.",
        "stop": "थांबा. विश्रांती घ्या आणि फिजिओथेरपिस्टचा सल्ला पाळा.",
    },
}


# DRAFT wording: needs review by a native-speaking clinician and by whoever signs off DPDP consent text.
CONSENT = {
    "en": {
        "use": "Before we start: this app uses this device's camera to measure arm movement. "
               "It saves only numbers (angles and repetition counts), never video or photos. "
               "You can stop at any time. The patient or their guardian must agree. "
               "This is a practice aid, not a doctor. If the patient feels pain, press P and stop. "
               "Press Y to agree, N to exit.",
        "share": "Share this session's results with the patient's physiotherapist under ABHA address {abha}? "
                 "Only angles and counts are shared. Press Y for yes, N for no (results then stay unnamed).",
    },
    "hi": {
        "use": "शुरू करने से पहले: यह ऐप इस डिवाइस के कैमरे से हाथ की गति नापता है। "
               "यह केवल संख्याएँ (कोण और बार की गिनती) सहेजता है, कोई वीडियो या फ़ोटो नहीं। "
               "आप कभी भी रुक सकते हैं। मरीज़ या उनके अभिभावक की सहमति ज़रूरी है। "
               "यह अभ्यास में मदद करने वाला साधन है, डॉक्टर नहीं। अगर मरीज़ को दर्द हो तो P दबाएँ और रुक जाएँ। "
               "सहमत होने के लिए Y दबाएँ, बाहर निकलने के लिए N।",
        "share": "क्या इस सत्र के परिणाम मरीज़ के फिज़ियोथेरेपिस्ट के साथ ABHA पते {abha} के अंतर्गत साझा करें? "
                 "केवल कोण और गिनती साझा होगी। हाँ के लिए Y, नहीं के लिए N (तब परिणाम बिना नाम के रहेंगे)।",
    },
    "mr": {
        "use": "सुरू करण्यापूर्वी: हे अ‍ॅप या उपकरणाच्या कॅमेऱ्याने हाताची हालचाल मोजते. "
               "ते फक्त आकडे (कोन आणि वेळांची संख्या) जतन करते, कोणताही व्हिडिओ किंवा फोटो नाही. "
               "तुम्ही केव्हाही थांबू शकता. रुग्ण किंवा त्यांच्या पालकांची संमती आवश्यक आहे. "
               "हे सरावासाठी मदत करणारे साधन आहे, डॉक्टर नाही. रुग्णाला वेदना झाल्यास P दाबा आणि थांबा. "
               "सहमत होण्यासाठी Y दाबा, बाहेर पडण्यासाठी N.",
        "share": "या सत्राचे निकाल रुग्णाच्या फिजिओथेरपिस्टसोबत ABHA पत्ता {abha} अंतर्गत शेअर करायचे का? "
                 "फक्त कोन आणि संख्या शेअर होतील. हो साठी Y, नाही साठी N (तेव्हा निकाल बिनानावाचे राहतील).",
    },
}


def _angle(a, b):
    na, nb = math.hypot(*a), math.hypot(*b)
    if na == 0 or nb == 0:
        return None
    c = (a[0] * b[0] + a[1] * b[1]) / (na * nb)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _vec(p, q):
    return (q[0] - p[0], q[1] - p[1])


def measure(lm, side):
    """Return {flexion, elbow, lean} in degrees, or None if any needed landmark is unreliable."""
    other = "left" if side == "right" else "right"
    need = [f"{side}_{j}" for j in ("shoulder", "elbow", "wrist", "hip")] + [f"{other}_shoulder", f"{other}_hip"]
    if any(n not in lm or lm[n][2] < MIN_VIS for n in need):
        return None
    sh, el, wr, hip = (lm[f"{side}_{j}"][:2] for j in ("shoulder", "elbow", "wrist", "hip"))
    flexion = _angle(_vec(sh, hip), _vec(sh, el))  # 0 = arm hanging, 90 = horizontal, 180 = overhead
    elbow = _angle(_vec(el, sh), _vec(el, wr))  # 180 = straight
    sm = ((sh[0] + lm[f"{other}_shoulder"][0]) / 2, (sh[1] + lm[f"{other}_shoulder"][1]) / 2)
    hm = ((hip[0] + lm[f"{other}_hip"][0]) / 2, (hip[1] + lm[f"{other}_hip"][1]) / 2)
    lean = abs(math.degrees(math.atan2(sm[0] - hm[0], hm[1] - sm[1])))  # 0 = upright
    if flexion is None or elbow is None:
        return None
    return {"flexion": flexion, "elbow": elbow, "lean": lean}


@dataclass
class Rep:
    peak: float
    reached_target: bool
    max_lean: float
    min_elbow: float
    flagged: bool  # "possible compensation, for physio review" - not a diagnosis


class RepCounter:
    """REST -> MOVING (flexion > start) -> rep ends when flexion < rest. Hysteresis avoids jitter."""

    def __init__(self, target=90, start=35, rest=25, max_lean=15, min_elbow=150, alpha=0.4):
        self.target, self.start, self.rest = target, start, rest
        self.max_lean, self.min_elbow, self.alpha = max_lean, min_elbow, alpha
        self.state, self.reps, self._f = "REST", [], None
        self._reset()

    def _reset(self):
        self._peak, self._lean, self._elbow = 0.0, 0.0, 180.0

    def update(self, m):
        """Feed one measurement (or None). Returns a cue key."""
        if m is None:
            return "reposition"  # state frozen: never judge on unreliable landmarks
        f = m["flexion"] if self._f is None else self.alpha * m["flexion"] + (1 - self.alpha) * self._f
        self._f = f
        if self.state == "REST":
            if f > self.start:
                self.state = "MOVING"
                self._reset()
                return "raise"
            return "ready"
        self._peak = max(self._peak, f)
        self._lean = max(self._lean, m["lean"])
        if f > 45:  # ignore elbow noise near the resting pose
            self._elbow = min(self._elbow, m["elbow"])
        if f < self.rest:
            flagged = self._lean > self.max_lean or self._elbow < self.min_elbow
            self.reps.append(Rep(self._peak, self._peak >= self.target, self._lean, self._elbow, flagged))
            self.state = "REST"
            return "rep_done"
        if m["lean"] > self.max_lean:
            return "lean"
        if f > 45 and m["elbow"] < self.min_elbow:
            return "elbow"
        return "good" if self._peak >= self.target else "higher"


def fhir_bundle(reps, side, target, abha=None, consented=False):
    """FHIR R4 collection Bundle of per-rep Observations.

    Identifiable only when the caregiver/patient gave consent AND an ABHA address is supplied (DPDP: consent first).
    Codes are local (urn:neuromotion); mapping to NRCeS/SNOMED profiles is future work.
    """
    now = datetime.now(timezone.utc).isoformat()
    subject = None
    entries = []
    if consented and abha:
        subject = {"identifier": {"system": "https://healthid.ndhm.gov.in", "value": abha}}
        entries.append({"resource": {
            "resourceType": "Consent", "status": "active",
            "scope": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/consentscope", "code": "patient-privacy"}]},
            "category": [{"coding": [{"system": "http://loinc.org", "code": "59284-0"}]}],
            "patient": subject, "dateTime": now,
        }})
    for i, r in enumerate(reps, 1):
        obs = {
            "resourceType": "Observation", "status": "preliminary",
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "therapy"}]}],
            "code": {"coding": [{"system": "urn:neuromotion", "code": "shoulder-flexion-peak"}],
                     "text": f"Shoulder flexion peak, {side} arm, rep {i} (2D camera estimate)"},
            "effectiveDateTime": now,
            "valueQuantity": {"value": round(r.peak, 1), "unit": "deg", "system": "http://unitsofmeasure.org", "code": "deg"},
            "method": {"text": "Smartphone 2D pose estimation; not a clinical goniometer"},
            "component": [
                {"code": {"text": f"Target {target} deg reached"}, "valueBoolean": r.reached_target},
                {"code": {"text": "Max trunk lean (deg)"}, "valueQuantity": {"value": round(r.max_lean, 1), "unit": "deg"}},
                {"code": {"text": "Min elbow angle (deg)"}, "valueQuantity": {"value": round(r.min_elbow, 1), "unit": "deg"}},
                {"code": {"text": "Possible compensation - for physiotherapist review"}, "valueBoolean": r.flagged},
            ],
        }
        if subject:
            obs["subject"] = subject
        entries.append({"resource": obs})
    return {"resourceType": "Bundle", "type": "collection", "timestamp": now, "entry": entries}
