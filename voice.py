"""Offline spoken cues via Windows OneCore voices (WinRT). No network.

Speaks only when the cue changes, latest cue wins (stale cues are dropped).
If no voice for the language is installed (Marathi usually isn't), it stays silent
rather than faking it with a Hindi voice; the on-screen text still shows.
"""
import asyncio
import os
import queue
import tempfile
import threading
import winsound

from winrt.windows.media.speechsynthesis import SpeechSynthesizer
from winrt.windows.storage.streams import DataReader


PREFER = {"en": ("en-in", "en"), "hi": ("hi",), "mr": ("mr",)}


def find_voice(lang):
    """First installed voice for `lang` (English prefers en-IN), or None."""
    for tag in PREFER.get(lang, (lang,)):
        v = next((v for v in SpeechSynthesizer.all_voices if v.language.lower().startswith(tag)), None)
        if v:
            return v
    return None


async def _synth(voice, text):
    s = SpeechSynthesizer()
    s.voice = voice
    stream = await s.synthesize_text_to_stream_async(text)
    reader = DataReader(stream.get_input_stream_at(0))
    await reader.load_async(stream.size)
    buf = bytearray(stream.size)
    reader.read_bytes(buf)
    return bytes(buf)


class Speaker:
    def __init__(self, lang):
        self.voice = find_voice(lang)
        self.available = self.voice is not None
        self._q, self._last = queue.Queue(), None
        if self.available:
            self._dir = tempfile.mkdtemp(prefix="coach-tts-")
            threading.Thread(target=self._run, daemon=True).start()

    def say(self, key, text):
        if not self.available or key == self._last:
            return
        self._last = key
        while not self._q.empty():  # drop stale cues
            self._q.get_nowait()
        self._q.put(text)

    def reset(self):
        self._last = None  # allow the same cue to be spoken again later

    def _run(self):
        loop, n = asyncio.new_event_loop(), 0
        while True:
            text = self._q.get()
            try:
                path = os.path.join(self._dir, f"{n % 4}.wav")
                n += 1
                with open(path, "wb") as f:
                    f.write(loop.run_until_complete(_synth(self.voice, text)))
                winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
            except Exception as e:  # voice failure must never stop coaching
                print("voice error:", e)
