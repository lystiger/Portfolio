import math
import random
from PIL import Image, ImageDraw, ImageFilter

# Deterministic seed for repeatable artistic beauty
random.seed(2026)

WIDTH = 3840
HEIGHT = 280
SCALE = 2
SW = WIDTH * SCALE
SH = HEIGHT * SCALE

def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
        u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
    )

def draw_tapered_blade(draw, x_root, y_root, height, base_w, lean_deg, bend, dark_col, mid_col, tip_col):
    rad = math.radians(lean_deg)
    sin_a = math.sin(rad)
    cos_a = math.cos(rad)

    wind_push = bend * (height * 0.42)

    p0 = (x_root, y_root)
    p1 = (x_root + sin_a * (height * 0.32), y_root - cos_a * (height * 0.32))
    p2 = (x_root + sin_a * (height * 0.68) + wind_push * 0.5, y_root - cos_a * (height * 0.68))
    p3 = (x_root + sin_a * height + wind_push, y_root - cos_a * height)

    steps = 18
    spine = [bezier(p0, p1, p2, p3, i / steps) for i in range(steps + 1)]

    left_pts = []
    right_pts = []

    for i in range(steps):
        cx, cy = spine[i]
        t = i / steps
        # Smooth taper down to a sharp needle tip at t=1.0
        w = base_w * (1.0 - t) ** 1.35

        dx = spine[i+1][0] - cx
        dy = spine[i+1][1] - cy
        dist = math.hypot(dx, dy) or 1.0
        nx = -dy / dist
        ny = dx / dist

        left_pts.append((cx - nx * (w * 0.55), cy - ny * (w * 0.55)))
        right_pts.append((cx + nx * (w * 0.45), cy + ny * (w * 0.45)))

    # The tip itself is a single sharp vertex
    tip_pt = spine[-1]
    blade_poly = left_pts + [tip_pt] + list(reversed(right_pts))

    # Draw shadow body
    draw.polygon(blade_poly, fill=dark_col)

    # Draw sunlit upper edge & highlight
    if len(right_pts) > 5:
        # Subtle sunlit edge along windward side
        draw.line(right_pts[4:] + [tip_pt], fill=tip_col, width=max(1, int(base_w * 0.28)))
        # Midtone central body
        mid_spine = spine[2:-2]
        if len(mid_spine) > 1:
            draw.line(mid_spine, fill=mid_col, width=max(1, int(base_w * 0.38)))

def draw_tuft(draw, x_center, y_base, tuft_scale, config):
    num_blades = random.randint(config['tuft_min'], config['tuft_max'])
    base_h = random.uniform(config['h_min'], config['h_max']) * SCALE * tuft_scale
    base_w = random.uniform(config['w_min'], config['w_max']) * SCALE * tuft_scale

    for b in range(num_blades):
        # Fan distribution with strong rightward breeze bias
        spread = random.uniform(config['angle_min'], config['angle_max'])
        h = base_h * random.uniform(0.72, 1.18)
        w = base_w * random.uniform(0.8, 1.25)
        bend = random.uniform(0.35, 0.92)

        xr = x_center + random.uniform(-16 * SCALE, 16 * SCALE)
        yr = y_base + random.uniform(0, 8 * SCALE)

        d = random.choice(config['darks'])
        m = random.choice(config['mids'])
        t = random.choice(config['tips'])

        draw_tapered_blade(draw, xr, yr, h, w, spread, bend, d, m, t)

def render_layer(config):
    img = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    y_base = SH - int(8 * SCALE)

    # Base meadow grounding gradient (solid dark earth green at very bottom)
    base_h = int(config['base_h'] * SCALE)
    base_rgb = config['base_color']
    for y in range(SH - base_h, SH):
        p = (y - (SH - base_h)) / base_h
        alpha = int(255 * (p ** 1.3))
        draw.line([(0, y), (SW, y)], fill=(base_rgb[0], base_rgb[1], base_rgb[2], alpha))

    # Tufts across landscape
    x = -50 * SCALE
    while x < SW + 50 * SCALE:
        terrain = 1.0 + 0.10 * math.sin(x / (550 * SCALE)) + 0.06 * math.cos(x / (240 * SCALE))
        draw_tuft(draw, x, y_base, terrain, config)
        x += random.uniform(config['spacing_min'], config['spacing_max']) * SCALE

    # Downsample with Lanczos for pristine anti-aliased edges
    down = img.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    return down

print('Generating high-resolution Ghibli grass layers (3840x280)...')

# 1. Back Layer: Cooler sage/olive green, atmospheric, slightly softer
back_cfg = {
    'tuft_min': 8,
    'tuft_max': 13,
    'spacing_min': 12,
    'spacing_max': 22,
    'h_min': 85,
    'h_max': 135,
    'w_min': 5.0,
    'w_max': 8.5,
    'angle_min': -10,
    'angle_max': 45,
    'base_h': 36,
    'base_color': (45, 66, 32),
    'darks': [(52, 74, 36, 235), (58, 82, 42, 235), (46, 68, 32, 235)],
    'mids':  [(74, 102, 50, 235), (82, 112, 56, 235), (88, 120, 60, 235)],
    'tips':  [(108, 145, 70, 235), (120, 158, 80, 235), (132, 170, 88, 235)]
}

# 2. Middle Layer: Main silhouette, vibrant sap green, warm sunlit highlights
mid_cfg = {
    'tuft_min': 9,
    'tuft_max': 15,
    'spacing_min': 15,
    'spacing_max': 26,
    'h_min': 115,
    'h_max': 175,
    'w_min': 7.0,
    'w_max': 12.0,
    'angle_min': -14,
    'angle_max': 52,
    'base_h': 46,
    'base_color': (38, 58, 24),
    'darks': [(62, 88, 38, 255), (70, 98, 44, 255), (56, 80, 34, 255)],
    'mids':  [(92, 130, 54, 255), (104, 144, 62, 255), (114, 156, 68, 255)],
    'tips':  [(148, 192, 80, 255), (164, 208, 92, 255), (178, 222, 102, 255)]
}

# 3. Front Layer: Hero foreground blades, tall, sun-drenched chartreuse / golden lime
front_cfg = {
    'tuft_min': 5,
    'tuft_max': 10,
    'spacing_min': 24,
    'spacing_max': 44,
    'h_min': 145,
    'h_max': 210,
    'w_min': 9.0,
    'w_max': 15.0,
    'angle_min': -16,
    'angle_max': 56,
    'base_h': 50,
    'base_color': (32, 48, 20),
    'darks': [(74, 106, 44, 255), (86, 120, 52, 255), (66, 96, 40, 255)],
    'mids':  [(118, 162, 66, 255), (132, 178, 76, 255), (146, 192, 84, 255)],
    'tips':  [(186, 230, 104, 255), (204, 244, 118, 255), (220, 255, 134, 255)]
}

back = render_layer(back_cfg)
mid = render_layer(mid_cfg)
front = render_layer(front_cfg)

# Save WebP and PNG
back.save('assets/grass-back.webp', 'WEBP', quality=95, method=6)
mid.save('assets/grass-mid.webp', 'WEBP', quality=95, method=6)
front.save('assets/grass-front.webp', 'WEBP', quality=95, method=6)

back.save('assets/grass-back.png', 'PNG', optimize=True)
mid.save('assets/grass-mid.png', 'PNG', optimize=True)
front.save('assets/grass-front.png', 'PNG', optimize=True)

# Generate drifting floating leaves/blades for the optional atmospheric detail
leaf_canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
ldraw = ImageDraw.Draw(leaf_canvas)
# A small curved floating blade
draw_tapered_blade(ldraw, 30, 110, 70, 8, 45, 0.7, (74, 106, 44, 240), (120, 164, 68, 240), (190, 235, 108, 250))
leaf_small = leaf_canvas.resize((64, 64), Image.Resampling.LANCZOS)
leaf_small.save('assets/grass-leaf.webp', 'WEBP', quality=95)
leaf_small.save('assets/grass-leaf.png', 'PNG', optimize=True)

comp = Image.alpha_composite(Image.alpha_composite(back, mid), front)
comp.save('/tmp/grass_sharp_comp.png', 'PNG')

print('Pristine 3840x280 grass layers & grass-leaf successfully generated!')
