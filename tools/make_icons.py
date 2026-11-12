from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)

INK = "#172029"
CREAM = "#fff0cf"
CORAL = "#e86043"
CORAL_DARK = "#bf3e2c"
TEAL = "#1b9996"
TEAL_LIGHT = "#65d6c8"
GOLD = "#f5b848"
PAPER = "#fffdf8"


def rounded_rectangle(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size=1024, maskable=False):
    scale = size / 1024
    img = Image.new("RGBA", (size, size), INK)
    draw = ImageDraw.Draw(img)

    # Paper field and ink frame.
    margin = 46 if maskable else 58
    rounded_rectangle(draw, (margin, margin, size - margin, size - margin), 150,
                      fill=PAPER, outline=INK, width=18)
    inner = margin + 44
    rounded_rectangle(draw, (inner, inner, size - inner, size - inner), 112,
                      outline=INK, width=4)

    # Cropped coral sun.
    draw.ellipse((size * 0.55, -size * 0.23, size * 1.13, size * 0.35), fill=CORAL, outline=INK, width=12)
    draw.ellipse((size * 0.60, -size * 0.18, size * 1.08, size * 0.30), outline=CREAM, width=4)

    # Horizon lines.
    draw.line((size * 0.10, size * 0.73, size * 0.90, size * 0.73), fill=INK, width=9)
    draw.line((size * 0.16, size * 0.78, size * 0.84, size * 0.78), fill="#ded3bc", width=3)

    # Rear flag.
    pole_x = size * 0.235
    draw.line((pole_x, size * 0.26, pole_x, size * 0.55), fill=INK, width=13)
    draw.ellipse((pole_x - 13, size * 0.245, pole_x + 13, size * 0.271), fill=GOLD, outline=INK, width=4)
    flag = [
        (pole_x + 7, size * 0.285),
        (pole_x + size * 0.245, size * 0.33),
        (pole_x + size * 0.19, size * 0.40),
        (pole_x + size * 0.235, size * 0.455),
        (pole_x + 7, size * 0.49),
    ]
    draw.polygon(flag, fill=CORAL, outline=INK)
    draw.line((pole_x + 20, size * 0.33, pole_x + size * 0.19, size * 0.35), fill=CREAM, width=7)

    # Wings (behind the car).
    left_wing = [
        (size * 0.43, size * 0.56),
        (size * 0.10, size * 0.50),
        (size * 0.17, size * 0.58),
        (size * 0.39, size * 0.63),
    ]
    right_wing = [
        (size * 0.61, size * 0.56),
        (size * 0.92, size * 0.48),
        (size * 0.87, size * 0.56),
        (size * 0.65, size * 0.63),
    ]
    draw.polygon(left_wing, fill=TEAL, outline=INK)
    draw.polygon(right_wing, fill=TEAL, outline=INK)
    draw.line((size * 0.13, size * 0.52, size * 0.36, size * 0.59), fill=CREAM, width=5)
    draw.line((size * 0.88, size * 0.50, size * 0.66, size * 0.59), fill=CREAM, width=5)

    # Wheels.
    for cx in (size * 0.355, size * 0.69):
        cy = size * 0.69
        r = size * 0.115
        draw.ellipse((cx - r - 14, cy - r - 14, cx + r + 14, cy + r + 14), fill=CREAM, outline=INK, width=10)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK)
        draw.ellipse((cx - r * 0.43, cy - r * 0.43, cx + r * 0.43, cy + r * 0.43), fill=GOLD, outline=CREAM, width=4)
        for angle_box in [
            (cx - 5, cy - r + 10, cx + 5, cy - r * 0.38),
            (cx - 5, cy + r * 0.38, cx + 5, cy + r - 10),
            (cx - r + 10, cy - 5, cx - r * 0.38, cy + 5),
            (cx + r * 0.38, cy - 5, cx + r - 10, cy + 5),
        ]:
            draw.rectangle(angle_box, fill=CREAM)

    # Lower chassis.
    body = [
        (size * 0.235, size * 0.575),
        (size * 0.32, size * 0.515),
        (size * 0.755, size * 0.515),
        (size * 0.835, size * 0.585),
        (size * 0.80, size * 0.635),
        (size * 0.27, size * 0.635),
        (size * 0.205, size * 0.605),
    ]
    draw.polygon(body, fill=CORAL, outline=INK)
    draw.line((size * 0.28, size * 0.60, size * 0.78, size * 0.60), fill=CORAL_DARK, width=8)

    # Cockpit / canopy.
    cockpit = [
        (size * 0.43, size * 0.515),
        (size * 0.49, size * 0.40),
        (size * 0.59, size * 0.40),
        (size * 0.66, size * 0.515),
    ]
    draw.polygon(cockpit, fill=TEAL, outline=INK)
    draw.polygon([
        (size * 0.49, size * 0.405),
        (size * 0.57, size * 0.405),
        (size * 0.585, size * 0.46),
        (size * 0.505, size * 0.46),
    ], fill=CREAM, outline=INK, width=4)

    # Big rear exhaust.
    draw.rounded_rectangle(
        (size * 0.70, size * 0.475, size * 0.84, size * 0.555),
        radius=size * 0.035, fill=CREAM, outline=INK, width=8
    )
    draw.ellipse((size * 0.795, size * 0.482, size * 0.852, size * 0.548), fill=INK)
    draw.ellipse((size * 0.812, size * 0.498, size * 0.838, size * 0.532), fill=CORAL)

    # Headlight.
    draw.ellipse((size * 0.756, size * 0.545, size * 0.796, size * 0.585), fill=GOLD, outline=INK, width=5)

    # Number plate.
    draw.ellipse((size * 0.43, size * 0.55, size * 0.55, size * 0.63), fill=CREAM, outline=INK, width=6)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(size * 0.052))
    except OSError:
        font = ImageFont.load_default()
    draw.text((size * 0.49, size * 0.588), "07", font=font, fill=INK, anchor="mm")

    # Ground shadow / dust accent.
    draw.arc((size * 0.18, size * 0.69, size * 0.83, size * 0.83), 10, 170, fill=INK, width=7)

    return img


base_icon = draw_icon(1024, maskable=False)

for output_size, filename, maskable in [
    (192, "icon-192.png", False),
    (512, "icon-512.png", False),
    (512, "icon-maskable-512.png", True),
    (180, "apple-touch-icon.png", False),
]:
    if maskable:
        # Keep every drawn element inside the 80% maskable safe zone.
        canvas = Image.new("RGBA", (1024, 1024), INK)
        inner = base_icon.resize((780, 780), Image.Resampling.LANCZOS)
        canvas.paste(inner, ((1024 - 780) // 2, (1024 - 780) // 2), inner)
        base = canvas
    else:
        base = base_icon.copy()
    base = base.resize((output_size, output_size), Image.Resampling.LANCZOS)
    base.save(ICONS / filename, optimize=True)

print("icons written")
