import os
import math
from PIL import Image, ImageChops, ImageStat

RESULTS_DIR = 'qa-results'
VIEWPORTS = ['1920x1080', '1440x900', '1366x768', '390x844']

def analyze():
    print("\n" + "=" * 60)
    print("PIXEL ACCURACY ANALYSIS: STATIC BASELINE vs WEBGL REST FRAME")
    print("=" * 60)

    for vp in VIEWPORTS:
        static_file = os.path.join(RESULTS_DIR, f"{vp}-static.png")
        webgl_file = os.path.join(RESULTS_DIR, f"{vp}-webgl-rest.png")

        if not os.path.exists(static_file) or not os.path.exists(webgl_file):
            print(f"[-] Missing files for {vp}")
            continue

        im_static = Image.open(static_file).convert('RGB')
        im_webgl = Image.open(webgl_file).convert('RGB')

        # Crop to hero section (top 100vh)
        w, h = im_static.size
        # The hero section is 100vh which matches the viewport height
        diff = ImageChops.difference(im_static, im_webgl)

        stat = ImageStat.Stat(diff)
        # stat.mean is average difference per channel [R, G, B]
        mean_diff = sum(stat.mean) / 3.0
        # stat.rms is root mean square difference
        rms_diff = math.sqrt(sum(x*x for x in stat.rms) / 3.0)

        # Count pixels with non-zero diff
        diff_gray = diff.convert('L')
        nonzero_count = sum(1 for p in diff_gray.getdata() if p > 5) # threshold > 5 to avoid tiny compression noise
        total_pixels = w * h
        diff_pct = (nonzero_count / total_pixels) * 100.0

        # Create amplified difference visualization (amplified 8x)
        diff_amp = diff_gray.point(lambda p: min(255, p * 8))
        diff_amp_rgb = Image.merge("RGB", (diff_amp, diff_amp.point(lambda p: 0), diff_amp.point(lambda p: 0))) # red tint
        diff_amp_file = os.path.join(RESULTS_DIR, f"{vp}-diff-amplified.png")
        diff_amp.save(diff_amp_file)

        print(f"Viewport: {vp:10s} | Size: {w}x{h} | Mean Error: {mean_diff:.2f}/255 | RMS: {rms_diff:.2f} | Significant Diff: {diff_pct:.2f}%")

    print("\n" + "=" * 60)
    print("PARALLAX AMPLITUDE EVALUATION (LEFT vs RIGHT CURSOR)")
    print("=" * 60)

    for vp in ['1920x1080', '1440x900', '1366x768']:
        left_file = os.path.join(RESULTS_DIR, f"{vp}-parallax-left.png")
        right_file = os.path.join(RESULTS_DIR, f"{vp}-parallax-right.png")

        if not os.path.exists(left_file) or not os.path.exists(right_file):
            continue

        im_left = Image.open(left_file).convert('RGB')
        im_right = Image.open(right_file).convert('RGB')

        diff = ImageChops.difference(im_left, im_right)
        stat = ImageStat.Stat(diff)
        mean_diff = sum(stat.mean) / 3.0
        rms_diff = math.sqrt(sum(x*x for x in stat.rms) / 3.0)

        diff_gray = diff.convert('L')
        nonzero = sum(1 for p in diff_gray.getdata() if p > 5)
        total = im_left.width * im_left.height
        pct = (nonzero / total) * 100.0

        print(f"Viewport: {vp:10s} | Parallax Shift: {pct:.2f}% pixels affected | Mean Delta: {mean_diff:.2f} | RMS: {rms_diff:.2f}")

if __name__ == '__main__':
    analyze()
