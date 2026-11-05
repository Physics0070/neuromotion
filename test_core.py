"""Run: python test_core.py  (no camera needed)"""
import json
import math

from core import MIN_VIS, RepCounter, fhir_bundle, measure


def pose(flex, lean_dx=0.0, elbow_bend=0.0, vis=1.0, hide=None):
    """Synthetic right-arm pose; flex in degrees, 0 = arm hanging."""
    off = math.atan2(lean_dx, 0.3)  # flexion is measured against the (leaned) trunk
    t = math.radians(flex) - off
    sh = (0.5 + lean_dx, 0.3)
    el = (sh[0] + 0.2 * math.sin(t), sh[1] + 0.2 * math.cos(t))
    t2 = t + math.radians(elbow_bend)
    wr = (el[0] + 0.2 * math.sin(t2), el[1] + 0.2 * math.cos(t2))
    lm = {
        "right_shoulder": (*sh, vis), "right_elbow": (*el, vis), "right_wrist": (*wr, vis), "right_hip": (0.5, 0.6, vis),
        "left_shoulder": (*sh, vis), "left_hip": (0.5, 0.6, vis),
    }
    if hide:
        lm[hide] = (*lm[hide][:2], MIN_VIS - 0.1)
    return lm


def near(a, b, tol=0.5):
    return abs(a - b) < tol


# geometry
for f in (0, 45, 90, 135, 180):
    assert near(measure(pose(f), "right")["flexion"], f), f
assert near(measure(pose(90), "right")["elbow"], 180)
assert near(measure(pose(90, elbow_bend=60), "right")["elbow"], 120)
assert measure(pose(0), "right")["lean"] < 0.5
assert measure(pose(0, lean_dx=0.15), "right")["lean"] > 25

# SafeCue: occluded wrist -> no measurement, cue is reposition, state untouched
assert measure(pose(90, hide="right_wrist"), "right") is None
c = RepCounter()
assert c.update(None) == "reposition" and c.state == "REST" and not c.reps


def run(frames):
    c = RepCounter(alpha=1.0)  # no smoothing so thresholds are exact
    cues = [c.update(measure(p, "right")) for p in frames]
    return c, cues


up_down = lambda peak, **kw: [pose(f, **kw) for f in list(range(0, peak + 1, 10)) + list(range(peak, -1, -10))]

# clean full rep
c, cues = run(up_down(100))
assert len(c.reps) == 1 and c.reps[0].reached_target and not c.reps[0].flagged and "rep_done" in cues
assert "good" in cues and near(c.reps[0].peak, 100)

# short rep: counted, target not reached, coach says "higher"
c, cues = run(up_down(60))
assert len(c.reps) == 1 and not c.reps[0].reached_target and "higher" in cues

# trunk lean -> flagged for review + live "lean" cue
c, cues = run(up_down(100, lean_dx=0.15))
assert c.reps[0].flagged and "lean" in cues

# bent elbow -> flagged + "elbow" cue
c, cues = run(up_down(100, elbow_bend=-50))
assert c.reps[0].flagged and "elbow" in cues

# occlusion mid-rep does not end or corrupt the rep
frames = up_down(100)
c = RepCounter(alpha=1.0)
for i, p in enumerate(frames):
    c.update(None if i == 4 else measure(p, "right"))
assert len(c.reps) == 1 and near(c.reps[0].peak, 100)

# two reps
c, _ = run(up_down(100) + up_down(100))
assert len(c.reps) == 2

# FHIR: pseudonymous by default, identifiable only with consent + ABHA
c, _ = run(up_down(100))
b = fhir_bundle(c.reps, "right", 90, abha="demo@abdm", consented=False)
json.dumps(b)
assert b["resourceType"] == "Bundle" and "demo@abdm" not in json.dumps(b)
assert all("subject" not in e["resource"] for e in b["entry"])
b = fhir_bundle(c.reps, "right", 90, abha="demo@abdm", consented=True)
kinds = [e["resource"]["resourceType"] for e in b["entry"]]
assert kinds == ["Consent", "Observation"] and b["entry"][1]["resource"]["subject"]["identifier"]["value"] == "demo@abdm"
assert b["entry"][1]["resource"]["valueQuantity"]["unit"] == "deg"

# every language has every cue and both consent texts (a missing key would crash mid-session)
from core import CONSENT, CUES
assert all(set(CUES[l]) == set(CUES["en"]) for l in CUES)
assert all(set(CONSENT[l]) == {"use", "share"} for l in CONSENT) and set(CONSENT) == set(CUES)
assert all("{abha}" in CONSENT[l]["share"] and "P" in CONSENT[l]["use"] for l in CONSENT)
assert "demo@abdm" in CONSENT["hi"]["share"].format(abha="demo@abdm")

print("all tests passed")
