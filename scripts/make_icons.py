"""Generate the extension icons (four rank-coloured diagonal stripes) without any dependencies."""
import struct, zlib, os

COLORS = [(0x22, 0xC5, 0x5E), (0xEA, 0xB3, 0x08), (0xF9, 0x73, 0x16), (0xEF, 0x44, 0x44)]

def png(size):
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type none
        for x in range(size):
            band = min(3, int((x + y) * 4 / (2 * size - 1)))
            row += bytes(COLORS[band])
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

out = os.path.join(os.path.dirname(__file__), '..', 'icons')
for s in (16, 48, 128):
    with open(os.path.join(out, f'icon{s}.png'), 'wb') as f:
        f.write(png(s))
print('icons written')
