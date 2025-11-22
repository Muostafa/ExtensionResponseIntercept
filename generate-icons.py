#!/usr/bin/env python3
"""
Generate professional icons for the API Response Interceptor Chrome extension
Requires: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow library not found.")
    print("Install it with: pip install Pillow")
    exit(1)

import math

def create_icon(size):
    """Create a professional icon representing API Response Interception

    Design: A rounded square with gradient background containing:
    - Curly brackets { } representing JSON/API
    - A lightning bolt or arrow through them representing interception
    """

    # Create image with transparency
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors - Indigo to Purple gradient (matching app theme)
    color_start = (99, 102, 241)   # Indigo #6366F1 (--primary)
    color_end = (139, 92, 246)     # Purple #8B5CF6 (--secondary)

    scale = size / 128  # Base scale from 128px
    padding = int(8 * scale)
    corner_radius = int(20 * scale)

    # Draw rounded rectangle background with gradient
    for y in range(size):
        ratio = y / size
        r = int(color_start[0] + (color_end[0] - color_start[0]) * ratio)
        g = int(color_start[1] + (color_end[1] - color_start[1]) * ratio)
        b = int(color_start[2] + (color_end[2] - color_start[2]) * ratio)
        color = (r, g, b, 255)
        draw.line([(0, y), (size, y)], fill=color)

    # Create rounded corners mask
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=corner_radius,
        fill=255
    )

    # Apply mask for rounded corners
    background = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    background.paste(img, mask=mask)
    img = background
    draw = ImageDraw.Draw(img)

    # Icon elements in white
    white = (255, 255, 255, 255)
    semi_white = (255, 255, 255, 220)

    center_x = size // 2
    center_y = size // 2

    # Draw curly brackets { }
    bracket_thickness = max(2, int(4 * scale))
    bracket_height = int(50 * scale)
    bracket_width = int(12 * scale)
    bracket_curve = int(8 * scale)

    # Left bracket {
    left_x = center_x - int(28 * scale)
    draw_curly_bracket(draw, left_x, center_y, bracket_height, bracket_width,
                       bracket_curve, bracket_thickness, white, is_left=True)

    # Right bracket }
    right_x = center_x + int(28 * scale)
    draw_curly_bracket(draw, right_x, center_y, bracket_height, bracket_width,
                       bracket_curve, bracket_thickness, white, is_left=False)

    # Draw interception arrow/lightning bolt in the center
    arrow_size = int(20 * scale)
    draw_intercept_arrow(draw, center_x, center_y, arrow_size, bracket_thickness, white)

    return img


def draw_curly_bracket(draw, x, center_y, height, width, curve, thickness, color, is_left):
    """Draw a curly bracket { or }"""

    half_height = height // 2
    top_y = center_y - half_height
    bottom_y = center_y + half_height

    # Direction multiplier
    d = 1 if is_left else -1

    # Draw bracket using lines (simplified but clean)
    # Top part
    points_top = [
        (x + d * width, top_y),
        (x + d * (width - curve), top_y),
        (x, top_y + curve),
        (x, center_y - curve),
        (x - d * curve, center_y),
    ]

    # Bottom part
    points_bottom = [
        (x - d * curve, center_y),
        (x, center_y + curve),
        (x, bottom_y - curve),
        (x + d * (width - curve), bottom_y),
        (x + d * width, bottom_y),
    ]

    # Draw as thick lines
    for i in range(len(points_top) - 1):
        draw.line([points_top[i], points_top[i + 1]], fill=color, width=thickness)

    for i in range(len(points_bottom) - 1):
        draw.line([points_bottom[i], points_bottom[i + 1]], fill=color, width=thickness)


def draw_intercept_arrow(draw, center_x, center_y, size, thickness, color):
    """Draw an intercept symbol - two arrows meeting with modification"""

    # Draw a stylized arrow pointing right with a break/intercept
    arrow_length = size
    arrow_head = size // 2

    # Left part of arrow (incoming)
    draw.line([
        (center_x - arrow_length, center_y),
        (center_x - thickness * 2, center_y)
    ], fill=color, width=thickness + 1)

    # Right part of arrow (outgoing, slightly offset to show modification)
    draw.line([
        (center_x + thickness * 2, center_y),
        (center_x + arrow_length, center_y)
    ], fill=color, width=thickness + 1)

    # Arrow head
    draw.polygon([
        (center_x + arrow_length + arrow_head // 2, center_y),
        (center_x + arrow_length - arrow_head // 3, center_y - arrow_head // 2),
        (center_x + arrow_length - arrow_head // 3, center_y + arrow_head // 2),
    ], fill=color)

    # Draw intercept circle/dot in the middle
    dot_radius = max(2, thickness)
    draw.ellipse([
        center_x - dot_radius,
        center_y - dot_radius,
        center_x + dot_radius,
        center_y + dot_radius
    ], fill=color)


def main():
    """Generate icons in three sizes"""
    sizes = [16, 48, 128]

    for size in sizes:
        img = create_icon(size)
        filename = f'icons/icon{size}.png'
        # Convert RGBA to RGB with white background for compatibility
        if img.mode == 'RGBA':
            # Create final image (keep RGBA for transparency support in Chrome)
            img.save(filename, 'PNG')
        else:
            img.save(filename)
        print(f'Created {filename}')

    print('\nIcons generated successfully!')
    print('Icons feature: Indigo-purple gradient with JSON brackets {{ }} and intercept arrow')
    print('You can now load the extension in Chrome.')


if __name__ == '__main__':
    main()
