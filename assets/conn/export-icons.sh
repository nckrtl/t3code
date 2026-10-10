#!/usr/bin/env bash
# Renders the Conn icons (assets/conn/{dev,prod}/app-icon.icon) with Icon Composer's ictool.
# Needs Xcode 26+ (or ICON_COMPOSER_TOOL) and the Swift toolchain. Run from anywhere.
# The macOS PNG cannot use Icon Composer's GUI-only "macOS pre-Tahoe" preset, so the full-bleed
# macOS render is placed into the same safe area by safe-area.swift (824px body, soft shadow).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
tool="${ICON_COMPOSER_TOOL:-/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

render() { # project platform size output
  "$tool" "$1" --export-image --output-file "$4" --platform "$2" --rendition Default \
    --width "$3" --height "$3" --scale 1 --design-generation 26 >/dev/null
}

swiftc -O "$here/safe-area.swift" -o "$work/safe-area"

export_variant() { # dir label (dev|prod) prefix
  local dir="$here/$1" prefix="$2" project="$here/$1/app-icon.icon"
  render "$project" iOS 1024 "$dir/$prefix-ios-1024.png"
  cp "$dir/$prefix-ios-1024.png" "$dir/$prefix-universal-1024.png"
  render "$project" macOS 1024 "$work/$prefix-macos-full.png"
  "$work/safe-area" "$work/$prefix-macos-full.png" "$dir/$prefix-macos-1024.png"
  render "$project" iOS 180 "$dir/$prefix-web-apple-touch-180.png"
  render "$project" iOS 32 "$dir/$prefix-web-favicon-32x32.png"
  render "$project" iOS 16 "$dir/$prefix-web-favicon-16x16.png"
  for size in 16 24 32 48 64 128 256; do render "$project" iOS "$size" "$work/$prefix-ico-$size.png"; done
  (cd "$repo" && bun -e '
    const { encodePngIco } = await import("./scripts/lib/icon-export.ts");
    const [work, prefix, out] = process.argv.slice(1);
    const fs = await import("node:fs");
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const ico = encodePngIco(sizes.map((size) => ({ size, contents: fs.readFileSync(`${work}/${prefix}-ico-${size}.png`) })));
    fs.writeFileSync(`${out}/${prefix}-web-favicon.ico`, ico);
    fs.writeFileSync(`${out}/${prefix}-windows.ico`, ico);
  ' "$work" "$prefix" "$dir")
}

export_variant dev conn-dev
export_variant prod conn-prod
echo "Updated Conn icons in $here"
