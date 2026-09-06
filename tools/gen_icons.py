#!/usr/bin/env python3
"""Generate neutral Emdadgar app icons using only the Python standard library.

The mark is a white heart on a dark-red rounded field. It intentionally avoids
protected Red Cross/Red Crescent emblems.
"""

import binascii
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "icons")

BG = (255, 248, 244, 255)
RED = (159, 31, 43, 255)
WHITE = (255, 255, 255, 255)


def chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)


def write_png(path: str, size: int, pixels: list[tuple[int, int, int, int]]) -> None:
    rows = []
    for y in range(size):
        row = bytearray([0])
        for pixel in pixels[y * size:(y + 1) * size]:
            row.extend(pixel)
        rows.append(bytes(row))
    payload = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(payload, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as file:
        file.write(png)


def rounded_square(x: float, y: float, half: float, radius: float) -> bool:
    qx = abs(x) - (half - radius)
    qy = abs(y) - (half - radius)
    outside = math.hypot(max(qx, 0), max(qy, 0))
    inside = min(max(qx, qy), 0)
    return outside + inside <= radius


def heart(x: float, y: float) -> bool:
    # Classic implicit heart curve. Positive y is up in this coordinate space.
    value = (x * x + y * y - 1) ** 3 - x * x * y ** 3
    return value <= 0


def make_icon(size: int, maskable: bool = False) -> list[tuple[int, int, int, int]]:
    pixels = []
    center = (size - 1) / 2
    field_half = size * (0.50 if maskable else 0.47)
    radius = size * (0.22 if maskable else 0.18)
    heart_scale = size * (0.19 if maskable else 0.22)
    heart_center_y = center - size * 0.015

    for py in range(size):
        for px in range(size):
            x = px - center
            y = py - center
            color = RED if rounded_square(x, y, field_half, radius) else BG

            hx = x / heart_scale
            hy = (heart_center_y - py) / heart_scale
            if heart(hx, hy):
                color = WHITE
            pixels.append(color)
    return pixels


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)
    for size in (192, 512):
        write_png(os.path.join(ICON_DIR, f"icon-{size}.png"), size, make_icon(size))
        write_png(os.path.join(ICON_DIR, f"maskable-{size}.png"), size, make_icon(size, maskable=True))
    write_png(os.path.join(ICON_DIR, "apple-touch-icon.png"), 180, make_icon(180))
    print("Generated neutral Emdadgar icons")


if __name__ == "__main__":
    main()
