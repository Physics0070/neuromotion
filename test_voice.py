"""Run: python test_voice.py  (Windows; uses installed OneCore voices, plays nothing)"""
import asyncio

import voice

assert voice.find_voice("hi") is not None, "no Hindi voice installed"
assert voice.find_voice("en").language.lower().startswith("en")
wav = asyncio.new_event_loop().run_until_complete(voice._synth(voice.find_voice("hi"), "हाथ को धीरे-धीरे ऊपर उठाइए।"))
assert wav[:4] == b"RIFF" and len(wav) > 10_000

# no Marathi voice installed -> silent no-op, never a Hindi stand-in
if voice.find_voice("mr") is None:
    s = voice.Speaker("mr")
    assert not s.available
    s.say("good", "x")  # must not raise

print("voice tests passed")
