"""Run: python test_consent.py  (no window, camera or sound: cv2 and the speaker are stubbed)"""
import os
import sys
import tempfile

import cv2

import coach

keys = []
cv2.imshow = lambda *a: None
cv2.destroyAllWindows = lambda: None
cv2.waitKey = lambda ms=0: ord(keys.pop(0)) if keys else 255
coach.Speaker.say = lambda self, key, text: None


def no_camera(*a):
    raise AssertionError("camera opened without consent")


cv2.VideoCapture = no_camera

keys[:] = ["y"]
assert coach.ask_consent("t", coach.Speaker("en"), "k") is True
keys[:] = ["n"]
assert coach.ask_consent("t", coach.Speaker("en"), "k") is False
keys[:] = ["x", "N"]  # unrelated key is ignored, then N
assert coach.ask_consent("t", coach.Speaker("en"), "k") is False

# declining the first screen: exits, opens no camera, writes nothing
out = tempfile.mkdtemp()
for lang in ("en", "hi", "mr"):
    keys[:] = ["n"]
    sys.argv = ["coach.py", "--lang", lang, "--out", out]
    try:
        coach.main()
        raise AssertionError("main continued after consent was declined")
    except SystemExit as e:
        assert "Consent not given" in str(e)
assert os.listdir(out) == []

print("consent tests passed")
