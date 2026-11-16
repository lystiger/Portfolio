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
#   master ──mask──> figure.webp  (near layer, RGBA)
#   master + clean ──mask+14px──> back.webp  (sky, plane, hangar, meadow)
#   hand-drawn polygons ──blur──> depth.png  (R depth 0 far..1 near, G meadow)
#
# Polygon coordinates are in plate pixels (1376x768), read off a grid overlay.
set -euo pipefail
cd "$(dirname "$0")/../assets"
out=hero-depth
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

magick layer-character-full.png -alpha extract -threshold 50% "$tmp/mask.png"

# Near layer: the master's own pixels inside the silhouette, 1px grown and
# softened so the edge antialiases instead of stair-stepping.
magick hero-master-bg.jpg \( "$tmp/mask.png" -morphology Dilate Disk:1 -blur 0x0.7 \) \
  -alpha off -compose CopyOpacity -composite -quality 90 "$out/figure.webp"

# Back layer: the master, with the figure (grown 14px, feathered) swapped for
# the clean plate.
magick hero-master-bg.jpg hero-bg-clean.webp \( "$tmp/mask.png" -morphology Dilate Disk:14 -blur 0x3 \) \
  -compose over -composite -quality 88 "$out/back.webp"

# Depth: sky 0; hangar and trees 0.65, the same as the meadow at the hill line
# (a depth step between them bends the hangar's walls); meadow rising to 0.85
# at the bottom edge. Green carries the wind mask: the meadow shrunk 28px, so
# the sway fades out before the hangar's base and the windsock pole.
meadow="480,768 700,715 800,700 1080,645 1376,605 1376,768"
hangar="1060,650 1080,520 1110,480 1180,455 1180,440 1376,350 1376,610"
# The windsock pole and sock stand in the sky but belong to the ground plane;
# left at sky depth, the pole bends where it crosses the hill line.
windsock="1148,650 1148,325 1260,325 1260,395 1176,395 1176,650"
magick -size 1376x768 xc:black -fill 'gray(65%)' -draw "polygon $hangar" -draw "polygon $windsock" "$tmp/far.png"
magick -size 1376x768 gradient:'gray(0%)-gray(85%)' "$tmp/ramp.png"
magick -size 1376x768 xc:black -fill white -draw "polygon $meadow" "$tmp/meadow.png"
magick "$tmp/far.png" \( "$tmp/ramp.png" "$tmp/meadow.png" -compose multiply -composite \) \
  -compose lighten -composite -blur 0x10 -resize 344x192 "$tmp/r.png"
magick "$tmp/meadow.png" -morphology Erode Disk:28 -blur 0x10 -resize 344x192 "$tmp/g.png"
magick "$tmp/r.png" "$tmp/g.png" -size 344x192 xc:black -combine -depth 8 "$out/depth.png"

ls -la "$out"
