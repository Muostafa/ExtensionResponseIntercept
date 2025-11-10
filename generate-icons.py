#!/usr/bin/env python3
"""
Generate simple placeholder icons for the Chrome extension
Requires: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow library not found.")
    print("Install it with: pip install Pillow")
    exit(1)

def create_icon(size):
    """Create a simple icon with a gradient background and a wrench symbol"""

    # Create image with gradient background
    img = Image.new('RGB', (size, size), '#667eea')
    draw = ImageDraw.Draw(img)

    # Draw gradient (simple approximation)
    for y in range(size):
        # Interpolate between #667eea and #764ba2
        ratio = y / size
        r = int(102 + (118 - 102) * ratio)
        g = int(126 + (75 - 126) * ratio)
        b = int(234 + (162 - 234) * ratio)
        color = (r, g, b)
        draw.line([(0, y), (size, y)], fill=color)

    # Draw a simple wrench icon in white
    # Scale factor for the icon elements
    scale = size / 32
    center_x = size // 2
    center_y = size // 2

    # Wrench handle (rectangle)
    handle_width = int(4 * scale)
    handle_height = int(12 * scale)
    handle_x1 = center_x - handle_width // 2
    handle_y1 = center_y - int(8 * scale)
    handle_x2 = handle_x1 + handle_width
    handle_y2 = handle_y1 + handle_height
    draw.rectangle([handle_x1, handle_y1, handle_x2, handle_y2], fill='white')

    # Wrench head (circle)
    head_radius = int(5 * scale)
    head_x = center_x
    head_y = center_y - int(8 * scale)
    draw.ellipse([
        head_x - head_radius,
        head_y - head_radius,
        head_x + head_radius,
        head_y + head_radius
    ], fill='white')

    # Wrench opening (rectangle to cut out from circle)
    opening_width = int(6 * scale)
    opening_height = int(4 * scale)
    opening_x1 = center_x - opening_width // 2
    opening_y1 = head_y - int(5 * scale)
    opening_x2 = opening_x1 + opening_width
    opening_y2 = opening_y1 + opening_height
    # Draw in gradient color to "cut out"
    ratio = opening_y1 / size
    r = int(102 + (118 - 102) * ratio)
    g = int(126 + (75 - 126) * ratio)
    b = int(234 + (162 - 234) * ratio)
    draw.rectangle([opening_x1, opening_y1, opening_x2, opening_y2], fill=(r, g, b))

    return img

def main():
    """Generate icons in three sizes"""
    sizes = [16, 48, 128]

    for size in sizes:
        img = create_icon(size)
        filename = f'icons/icon{size}.png'
        img.save(filename)
        print(f'Created {filename}')

    print('\nIcons generated successfully!')
    print('You can now load the extension in Chrome.')

if __name__ == '__main__':
    main()
