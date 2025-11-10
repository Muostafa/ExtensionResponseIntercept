#!/usr/bin/env python3
"""
Create simple solid-color PNG icons without external dependencies
"""

import struct
import zlib
import os

def create_png(width, height, rgb_color):
    """
    Create a simple PNG image with a solid color
    Args:
        width: image width
        height: image height
        rgb_color: tuple of (r, g, b) values (0-255)
    Returns:
        bytes: PNG file data
    """
    def png_chunk(chunk_type, data):
        chunk_data = chunk_type + data
        crc = zlib.crc32(chunk_data) & 0xffffffff
        return struct.pack('>I', len(data)) + chunk_data + struct.pack('>I', crc)

    # PNG signature
    png_data = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk (image header)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png_data += png_chunk(b'IHDR', ihdr)

    # IDAT chunk (image data)
    r, g, b = rgb_color
    raw_data = bytearray()
    for y in range(height):
        # Apply gradient effect (darker at top, lighter at bottom)
        ratio = y / height
        # Gradient from #667eea to #764ba2
        r_val = int(102 + (118 - 102) * ratio)
        g_val = int(126 + (75 - 126) * ratio)
        b_val = int(234 + (162 - 234) * ratio)

        raw_data.append(0)  # filter type
        for x in range(width):
            raw_data.extend([r_val, g_val, b_val])

    compressed = zlib.compress(bytes(raw_data), 9)
    png_data += png_chunk(b'IDAT', compressed)

    # IEND chunk (image end)
    png_data += png_chunk(b'IEND', b'')

    return png_data

def main():
    # Create icons directory if it doesn't exist
    os.makedirs('icons', exist_ok=True)

    # Base color (purple gradient)
    color = (102, 126, 234)  # #667eea

    sizes = [16, 48, 128]
    for size in sizes:
        png_data = create_png(size, size, color)
        filename = f'icons/icon{size}.png'
        with open(filename, 'wb') as f:
            f.write(png_data)
        print(f'Created {filename}')

    print('\nBasic icons created successfully!')
    print('The extension is now ready to load in Chrome.')

if __name__ == '__main__':
    main()
