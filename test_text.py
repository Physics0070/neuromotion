"""Run: python test_text.py  (Windows GDI text renderer)"""
import numpy as np

import textdraw
from core import CONSENT, CUES

for lang in CUES:
    for text in list(CUES[lang].values()) + [CONSENT[lang]["use"]]:
        img = textdraw.render(text, 640, fg=(255, 255, 255), bg=(0, 0, 0))
        assert img.shape[1] == 640 and img.shape[2] == 3
        assert (img.max(axis=2) > 0).any(), f"blank render: {text}"  # text pixels exist

# narrower width wraps to more lines
t = CONSENT["hi"]["use"]
assert textdraw.render(t, 400).shape[0] > textdraw.render(t, 900).shape[0]
# background colour is honoured (RGB in, BGR out)
assert tuple(textdraw.render("x", 100, bg=(10, 20, 30))[0, 0]) == (30, 20, 10)

print("text tests passed")
