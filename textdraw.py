"""Render wrapped, correctly shaped text (Devanagari included) to a BGR numpy image via Windows GDI.

Pillow without libraqm cannot shape Devanagari (vowel signs land on the wrong side), and
cv2.putText cannot draw it at all. GDI DrawTextW shapes complex scripts natively.
Windows only, like voice.py.
"""
import ctypes as C
from ctypes import wintypes as W
from functools import lru_cache

import numpy as np

gdi, user = C.WinDLL("gdi32"), C.WinDLL("user32")
H = C.c_void_p
gdi.CreateCompatibleDC.argtypes, gdi.CreateCompatibleDC.restype = [H], H
gdi.CreateFontW.argtypes = [C.c_int] * 5 + [W.DWORD] * 8 + [W.LPCWSTR]
gdi.CreateFontW.restype = H
gdi.SelectObject.argtypes, gdi.SelectObject.restype = [H, H], H
gdi.DeleteObject.argtypes = [H]
gdi.DeleteDC.argtypes = [H]
gdi.SetTextColor.argtypes = [H, W.DWORD]
gdi.SetBkMode.argtypes = [H, C.c_int]
user.DrawTextW.argtypes = [H, W.LPCWSTR, C.c_int, C.POINTER(W.RECT), W.UINT]
DT_WORDBREAK, DT_NOPREFIX, DT_CALCRECT = 0x10, 0x800, 0x400


class BMIH(C.Structure):
    _fields_ = [("biSize", W.DWORD), ("biWidth", W.LONG), ("biHeight", W.LONG), ("biPlanes", W.WORD),
                ("biBitCount", W.WORD), ("biCompression", W.DWORD), ("biSizeImage", W.DWORD),
                ("biXPelsPerMeter", W.LONG), ("biYPelsPerMeter", W.LONG), ("biClrUsed", W.DWORD),
                ("biClrImportant", W.DWORD)]


gdi.CreateDIBSection.argtypes = [H, C.POINTER(BMIH), W.UINT, C.POINTER(C.c_void_p), H, W.DWORD]
gdi.CreateDIBSection.restype = H


@lru_cache(maxsize=256)
def render(text, width, px=24, fg=(255, 255, 255), bg=(0, 0, 0), pad=10):
    """Return an (h, width, 3) BGR image of `text` word-wrapped to `width`. Colours are (R, G, B)."""
    dc = gdi.CreateCompatibleDC(None)
    font = gdi.CreateFontW(-px, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 4, 0, "Nirmala UI")
    gdi.SelectObject(dc, font)
    r = W.RECT(0, 0, width - 2 * pad, 0)
    user.DrawTextW(dc, text, -1, C.byref(r), DT_CALCRECT | DT_WORDBREAK | DT_NOPREFIX)
    h = r.bottom + 2 * pad
    bmi = BMIH(C.sizeof(BMIH), width, -h, 1, 32, 0, 0, 0, 0, 0, 0)  # negative height = top-down
    bits = C.c_void_p()
    bmp = gdi.CreateDIBSection(dc, C.byref(bmi), 0, C.byref(bits), None, 0)
    old = gdi.SelectObject(dc, bmp)
    img = np.ctypeslib.as_array(C.cast(bits, C.POINTER(C.c_ubyte)), shape=(h, width, 4))
    img[:] = (bg[2], bg[1], bg[0], 0)
    gdi.SetBkMode(dc, 1)  # transparent
    gdi.SetTextColor(dc, fg[0] | fg[1] << 8 | fg[2] << 16)
    box = W.RECT(pad, pad, width - pad, h - pad)
    user.DrawTextW(dc, text, -1, C.byref(box), DT_WORDBREAK | DT_NOPREFIX)
    gdi.GdiFlush()
    out = img[:, :, :3].copy()
    gdi.SelectObject(dc, old)
    gdi.DeleteObject(bmp)
    gdi.DeleteObject(font)
    gdi.DeleteDC(dc)
    return out
