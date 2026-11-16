#!/usr/bin/env bash
# Builds the depth-hero layers from the live plate, assets/hero-master-bg.jpg.
#
# The figure is cut from the master itself, not taken from
# layer-character-full.png: that file is a repaint whose line work and hair
# differ from the plate. Only its alpha is used, as the silhouette mask, which
# hugs the master figure to within a pixel. The hole the figure leaves in the
# back layer is filled from hero-bg-clean.webp, which shows only where the
# figure has moved off it.
#
# The plane and the windsock's sock are lifted out too, so the shader can fly
# the one and wave the other. hero-bg-clean.webp has no plane, so the plane
# and its contrail are found as the difference between the two plates. Both
# holes are filled by blurring the surrounding sky inward (a coarse-to-fine
# pyramid): the clean plate's sky is a slightly different blue, and pasting
# it in left the contrail as a faint streak.
#
#   master ──figure mask──> figure.webp  (near layer, RGBA)
#   master ──plate diff───> plane.webp   (sprite, RGBA)
#   master ──sock polygon─> sock.webp    (sprite, RGBA)
#   master ──dark hair × radial ramp──> hair.png  (stir weight, gray)
#   master + clean + inpaint ──> back.webp  (sky, clouds, hangar, meadow)
#   hand-drawn polygons ──blur──> depth.png
#       R depth 0 far..1 near, G meadow (wind), B open sky (cloud drift)
#
# Coordinates are in plate pixels (1376x768), read off grid overlays. The
# sprite rectangles are repeated in hero-depth.js (PLANE_RECT, SOCK_RECT,
# HAIR_RECT).
set -euo pipefail
cd "$(dirname "$0")/../assets"
out=hero-depth
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Figure silhouette: the repaint's alpha, grown by the master's own dark hair
# pixels around the head (175x125+890+210, down past the nape). The repaint
# misses some of the master's wisps; left in the back layer they stay put as
# ghost strands when the hair stirs or the figure shifts.
magick hero-master-bg.jpg -crop 175x125+890+210 +repage -colorspace Gray -threshold 52% -negate "$tmp/hdark.png"
magick hero-master-bg.jpg -crop 175x125+890+210 +repage -fx "(b>g+0.06 && b>r+0.06)?0:1" "$tmp/hnotsky.png"
magick "$tmp/hdark.png" "$tmp/hnotsky.png" -compose multiply -composite -morphology Close Disk:1 -morphology Dilate Disk:1 "$tmp/hairpx.png"
magick layer-character-full.png -alpha extract -threshold 50% \
  \( -size 1376x768 xc:black "$tmp/hairpx.png" -geometry +890+210 -compose over -composite \) \
  +geometry -compose lighten -composite "$tmp/mask.png"

# Near layer: the master's own pixels inside the silhouette, 1px grown and
# softened so the edge antialiases instead of stair-stepping.
magick hero-master-bg.jpg \( "$tmp/mask.png" -morphology Dilate Disk:1 -blur 0x0.7 \) \
  -alpha off -compose CopyOpacity -composite -quality 90 "$out/figure.webp"

# Plane and contrail: where master and clean differ inside the sky box around
# them. The sprite keeps the plane only (x < 706); the contrail is drawn by
# the shader so it can grow behind the moving plane.
magick -size 1376x768 xc:black \
  \( hero-master-bg.jpg -crop 340x140+590+90 hero-bg-clean.webp -crop 340x140+590+90 \
     -compose difference -composite -colorspace gray -threshold 6% \) \
  -geometry +590+90 -compose over -composite "$tmp/plane-diff.png"
magick hero-master-bg.jpg -crop 110x44+596+98 +repage \
  \( "$tmp/plane-diff.png" -crop 110x44+596+98 +repage -morphology Open Disk:1 -morphology Close Disk:1 -blur 0x0.6 \) \
  -alpha off -compose CopyOpacity -composite -quality 92 "$out/plane.webp"

# Sock: hand-drawn outline, sprite cropped to SOCK_RECT 100x64+1158+331.
sock="1163,345 1170,338 1182,338 1252,376 1253,388 1247,391 1182,374 1168,372 1163,365"
magick -size 1376x768 xc:black -fill white -draw "polygon $sock" "$tmp/sock.png"
magick hero-master-bg.jpg -crop 100x64+1158+331 +repage \
  \( "$tmp/sock.png" -crop 100x64+1158+331 +repage -morphology Dilate Disk:1 -blur 0x0.7 \) \
  -alpha off -compose CopyOpacity -composite -quality 92 "$out/sock.webp"

# Back layer: the master, with the figure (grown 14px, feathered) swapped for
# the clean plate, then the plane, contrail and sock cut out (grown 3-4px)
# and the holes filled from their surroundings. The contrail's last stretch
# (x >= 850) runs into a cloud, where a blur fill drags cloud colour into
# the blue and leaves a ghost trail, so that stretch takes the clean plate's
# cloud instead. Around the head (above y 335) the clean plate keeps a grey,
# head-shaped shadow in its clouds, which the hair stir and the parallax
# uncover. There the back layer keeps the master's own sky, so the hero at
# rest is unchanged. Under the silhouette (grown 5px, past the antialiased
# hair edge, which would otherwise smear into the fill) the hole is filled
# from its own edges, so stirring hair uncovers the local cloud colour, and
# more than ~10px in with the master's cumulus 120px above the head, so a
# bigger parallax shift uncovers cloud texture rather than a flat smear.
magick hero-master-bg.jpg hero-bg-clean.webp \( "$tmp/mask.png" -morphology Dilate Disk:14 -blur 0x3 \) \
  -compose over -composite "$tmp/back-a.png"
magick "$tmp/plane-diff.png" -morphology Open Disk:1 -morphology Dilate Disk:4 "$tmp/trail.png"
magick "$tmp/trail.png" -fill black -draw "rectangle 0,0 849,767" "$tmp/trail-cloud.png"
magick "$tmp/trail.png" -fill black -draw "rectangle 850,0 1375,767" "$tmp/trail-sky.png"
magick "$tmp/back-a.png" hero-bg-clean.webp \( "$tmp/trail-cloud.png" -blur 0x2 \) \
  -compose over -composite "$tmp/back-b.png"
magick "$tmp/mask.png" -morphology Dilate Disk:14 -fill black -draw "rectangle 0,335 1375,767" -blur 0x3 "$tmp/head14.png"
magick "$tmp/mask.png" -morphology Dilate Disk:5 -fill black -draw "rectangle 0,335 1375,767" -blur 0x1 "$tmp/head4.png"
magick "$tmp/back-b.png" hero-master-bg.jpg "$tmp/head14.png" -compose over -composite "$tmp/back-r.png"
magick "$tmp/back-r.png" \( "$tmp/head4.png" -negate \) -alpha off -compose CopyOpacity -composite "$tmp/head-holed.png"
magick \( "$tmp/head-holed.png" -resize 1% -resize 1376x768! \) \
       \( "$tmp/head-holed.png" -resize 3% -resize 1376x768! \) \
       \( "$tmp/head-holed.png" -resize 8% -resize 1376x768! \) \
       \( "$tmp/head-holed.png" -resize 25% -resize 1376x768! \) \
       "$tmp/head-holed.png" -background none -flatten -alpha off "$tmp/head-fill.png"
magick "$tmp/head4.png" -morphology Erode Disk:10 -blur 0x4 "$tmp/head-deep.png"
magick "$tmp/head-fill.png" \( hero-master-bg.jpg -roll +0+120 \) "$tmp/head-deep.png" \
  -compose over -composite "$tmp/back-c.png"
magick "$tmp/back-c.png" \( "$tmp/trail-sky.png" \( "$tmp/sock.png" -morphology Dilate Disk:3 \) \
  -compose lighten -composite -negate \) \
  -alpha off -compose CopyOpacity -composite "$tmp/holed.png"
magick \( "$tmp/holed.png" -resize 2% -resize 1376x768! \) \
       \( "$tmp/holed.png" -resize 8% -resize 1376x768! \) \
       \( "$tmp/holed.png" -resize 25% -resize 1376x768! \) \
       "$tmp/holed.png" -background none -flatten -alpha off -quality 88 "$out/back.webp"

# Hair weight for the stir, HAIR_RECT 175x90+890+210 around the head: the
# dark, non-sky pixels, weighted from 0 near the scalp (70,58 in the crop)
# to 1 at the tufts 50px out. Behind the head (crop x >= 60) it fades out
# below row 55, so the hair over the neck never tears against the skin; the
# brows and glasses (bottom-left) are masked out.
magick -size 175x90 xc: -fx "min(1,max(0,(hypot(i-70,j-58)-28)/22)) * (i<60 ? 1 : min(1,max(0,(75-j)/20)))" "$tmp/hramp.png"
magick "$tmp/hairpx.png" -crop 175x90+0+0 +repage \
  -fill black -draw "rectangle 0,76 70,89" \
  "$tmp/hramp.png" -compose multiply -composite -blur 0x1 -colorspace Gray -depth 8 "$out/hair.png"

# Depth: sky 0; hangar and trees 0.65, the same as the meadow at the hill line
# (a depth step between them bends the hangar's walls); meadow rising to 0.85
# at the bottom edge. Green carries the wind mask: the meadow shrunk 28px, so
# the sway fades out before the hangar's base and the windsock pole. Blue is
# open sky, where the clouds drift: everything but the ground and the pole,
# pulled back 18px so drifting clouds never smear the roofline.
meadow="480,768 700,715 800,700 1080,645 1376,605 1376,768"
hangar="1060,650 1080,520 1110,480 1180,455 1180,440 1376,350 1376,610"
# The windsock pole and sock stand in the sky but belong to the ground plane;
# left at sky depth, the pole bends where it crosses the hill line.
windsock="1148,650 1148,325 1260,325 1260,395 1176,395 1176,650"
pole="1148,650 1148,325 1176,325 1176,650"
magick -size 1376x768 xc:black -fill 'gray(65%)' -draw "polygon $hangar" -draw "polygon $windsock" "$tmp/far.png"
magick -size 1376x768 gradient:'gray(0%)-gray(85%)' "$tmp/ramp.png"
magick -size 1376x768 xc:black -fill white -draw "polygon $meadow" "$tmp/meadow.png"
magick "$tmp/far.png" \( "$tmp/ramp.png" "$tmp/meadow.png" -compose multiply -composite \) \
  -compose lighten -composite -blur 0x10 -resize 344x192 "$tmp/r.png"
magick "$tmp/meadow.png" -morphology Erode Disk:28 -blur 0x10 -resize 344x192 "$tmp/g.png"
magick -size 1376x768 xc:white -fill black -draw "polygon $meadow" -draw "polygon $hangar" -draw "polygon $pole" \
  -morphology Erode Disk:18 -blur 0x8 -resize 344x192 "$tmp/b.png"
magick "$tmp/r.png" "$tmp/g.png" "$tmp/b.png" -combine -depth 8 "$out/depth.png"

# Closing meadow band texture (grass-band.js): the clean plate's meadow below
# the hill line, 456x88+920+680 (clear of the trees on its left), made to
# tile by crossfading its last 80px over its first.
magick hero-bg-clean.webp -crop 456x88+920+680 +repage "$tmp/strip.png"
magick "$tmp/strip.png" -crop 376x88+0+0 +repage \
  \( "$tmp/strip.png" -crop 80x88+376+0 +repage \( -size 88x80 gradient:black-white -rotate 90 \) \
     -alpha off -compose CopyOpacity -composite \) \
  -compose over -composite -quality 90 meadow-strip.webp

ls -la "$out" meadow-strip.webp
