#!/usr/bin/env python3
"""Build transparent WebP sprite sheets for MBG SPPG meal trays (ompreng)
and optionally package gas/Index.html with an inline base64 WebP sheet.
"""

from collections import deque
from pathlib import Path
import argparse
import base64
import sys

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "assets" / "raw"
ASSETS_DIR = ROOT / "assets"

TRAY_FILES = [
    "tray-senin.png",
    "tray-selasa.png",
    "tray-rabu.png",
    "tray-kamis.png",
    "tray-jumat.png",
]


def remove_white_bg_floodfill(img: Image.Image) -> tuple[Image.Image, dict]:
    """Remove solid light background using strict border 4-connected BFS flood-fill.

    Never affects interior white highlights (e.g. steamed rice or specular metal)
    because flood-fill only traverses contiguous exterior background pixels.
    """
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    h, w, _ = arr.shape

    # If the source already uses real transparency around borders, preserve it.
    border_alpha = np.concatenate([arr[0, :, 3], arr[-1, :, 3], arr[:, 0, 3], arr[:, -1, 3]])
    if np.mean(border_alpha < 32) > 0.7:
        alpha_clean = arr[:, :, 3]
        fg_ratio = float(np.mean(alpha_clean > 16))
        return rgba, {"mode": "existing_alpha", "fg_ratio": fg_ratio}

    rgb = arr[:, :, :3].astype(np.int16)

    # Sample 8x8 corner patches to estimate background RGB
    corners = np.concatenate(
        [
            rgb[0:8, 0:8].reshape(-1, 3),
            rgb[0:8, w - 8 : w].reshape(-1, 3),
            rgb[h - 8 : h, 0:8].reshape(-1, 3),
            rgb[h - 8 : h, w - 8 : w].reshape(-1, 3),
        ],
        axis=0,
    )
    bg_rgb = np.median(corners, axis=0)

    diff = rgb - bg_rgb
    dist = np.sqrt(np.sum(diff * diff, axis=2))
    chan_max = np.max(rgb, axis=2)
    chan_min = np.min(rgb, axis=2)
    chroma = chan_max - chan_min
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # Candidate background pixels: close to corner RGB, neutral (low chroma), bright
    bg_candidate = ((dist <= 36.0) & (chroma <= 22) & (luma >= 216.0)) | (
        (dist <= 22.0) & (chroma <= 28)
    )

    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    # Seed from all 4 borders
    for x in range(w):
        if bg_candidate[0, x] and not visited[0, x]:
            visited[0, x] = True
            q.append((0, x))
        if bg_candidate[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(1, h - 1):
        if bg_candidate[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            q.append((y, 0))
        if bg_candidate[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        cy, cx = q.popleft()
        if cy > 0 and not visited[cy - 1, cx] and bg_candidate[cy - 1, cx]:
            visited[cy - 1, cx] = True
            q.append((cy - 1, cx))
        if cy + 1 < h and not visited[cy + 1, cx] and bg_candidate[cy + 1, cx]:
            visited[cy + 1, cx] = True
            q.append((cy + 1, cx))
        if cx > 0 and not visited[cy, cx - 1] and bg_candidate[cy, cx - 1]:
            visited[cy, cx - 1] = True
            q.append((cy, cx - 1))
        if cx + 1 < w and not visited[cy, cx + 1] and bg_candidate[cy, cx + 1]:
            visited[cy, cx + 1] = True
            q.append((cy, cx + 1))

    # Build alpha channel from BFS
    alpha = np.where(visited, 0, 255).astype(np.float32)

    # Detect exact outer steel rim bounding box & corner radius to strip any soft studio contact shadow
    gray = luma.astype(np.float32)
    top_prof = np.median(gray[: h // 2, int(w * 0.3) : int(w * 0.7)], axis=1)
    bot_prof = np.median(gray[h // 2 :, int(w * 0.3) : int(w * 0.7)], axis=1)
    left_prof = np.median(gray[int(h * 0.3) : int(h * 0.7), : w // 2], axis=0)
    right_prof = np.median(gray[int(h * 0.3) : int(h * 0.7), w // 2 :], axis=0)

    def _find_edge(prof, from_end=False):
        idxs = range(len(prof) - 6, 5, -1) if from_end else range(5, len(prof) - 5)
        for idx in idxs:
            if prof[idx] < 175:
                return idx
        return 0 if not from_end else len(prof) - 1

    y0 = _find_edge(top_prof, False)
    y1 = h // 2 + _find_edge(bot_prof, True)
    x0 = _find_edge(left_prof, False)
    x1 = w // 2 + _find_edge(right_prof, True)

    if x1 - x0 > w * 0.4 and y1 - y0 > h * 0.35:
        d_tl = next((d for d in range(1, 100) if gray[min(h - 1, y0 + d), min(w - 1, x0 + d)] < 165), 14)
        d_tr = next((d for d in range(1, 100) if gray[min(h - 1, y0 + d), max(0, x1 - d)] < 165), 14)
        est_r = max(24.0, min(d_tl, d_tr) / 0.2929)

        # Expand 2.5px beyond the dark rim line to preserve the bright stainless bevel
        pad_px = 2.5
        bx0, by0, bx1, by1 = x0 - pad_px, y0 - pad_px, x1 + pad_px, y1 + pad_px
        cx = 0.5 * (bx0 + bx1)
        cy = 0.5 * (by0 + by1)
        hx = 0.5 * (bx1 - bx0) - est_r
        hy = 0.5 * (by1 - by0) - est_r

        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        qx = np.abs(xx - cx) - hx
        qy = np.abs(yy - cy) - hy
        sdf = np.sqrt(np.maximum(qx, 0.0) ** 2 + np.maximum(qy, 0.0) ** 2) + np.minimum(np.maximum(qx, qy), 0.0) - est_r

        # Anything outside sdf > 0 is exterior studio background / contact shadow
        sdf_mask = np.clip(1.0 - sdf / 1.5, 0.0, 1.0) * 255.0
        alpha = np.minimum(alpha, sdf_mask)
        # Also remove pale corner shadow slightly inside est_r envelope
        corner_shadow = (sdf > -6.0) & (chroma <= 18) & (luma >= 186.0)
        alpha[corner_shadow] = 0.0

    # Dilate visited mask by 1px and 2px (pure NumPy) to de-fringe outer rim
    ext_mask = alpha < 16
    pad = np.pad(ext_mask, 1, mode="constant", constant_values=True)
    ring1 = (~ext_mask) & (
        pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    )
    pad2 = np.pad(ring1 | ext_mask, 1, mode="constant", constant_values=True)
    ring2 = (~ext_mask) & (~ring1) & (
        pad2[:-2, 1:-1] | pad2[2:, 1:-1] | pad2[1:-1, :-2] | pad2[1:-1, 2:]
    )

    # Soften white anti-aliased fringe pixels right on the outer edge
    fringe1 = ring1 & (chroma <= 30) & (luma >= 205)
    alpha[fringe1] = np.clip((252.0 - luma[fringe1]) * 4.2, 0.0, 210.0)

    fringe2 = ring2 & (chroma <= 24) & (luma >= 225)
    alpha[fringe2] = np.clip((255.0 - luma[fringe2]) * 5.0, 90.0, 240.0)

    # Remove tiny isolated exterior specks (foreground pixels surrounded by >= 7 empty neighbors)
    fg = alpha > 24
    fg_pad = np.pad(fg.astype(np.uint8), 1, mode="constant", constant_values=0)
    nbr_count = (
        fg_pad[:-2, :-2]
        + fg_pad[:-2, 1:-1]
        + fg_pad[:-2, 2:]
        + fg_pad[1:-1, :-2]
        + fg_pad[1:-1, 2:]
        + fg_pad[2:, :-2]
        + fg_pad[2:, 1:-1]
        + fg_pad[2:, 2:]
    )
    specks = fg & (nbr_count <= 2)
    alpha[specks] = 0

    out = arr.copy()
    out[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)

    # Color de-spill on semi-transparent edge pixels (subtract white bleed toward steel tone)
    semi = (out[:, :, 3] > 0) & (out[:, :, 3] < 230)
    if np.any(semi):
        a_norm = out[:, :, 3][semi][:, None] / 255.0
        fg_rgb = out[:, :, :3][semi].astype(np.float32)
        corrected = (fg_rgb - (1.0 - a_norm) * bg_rgb[None, :]) / np.maximum(a_norm, 0.15)
        out[:, :, :3][semi] = np.clip(corrected, 0, 255).astype(np.uint8)

    fg_ratio = float(np.mean(out[:, :, 3] > 16))
    info = {
        "mode": "floodfill",
        "bg_rgb": [int(round(x)) for x in bg_rgb.tolist()],
        "fg_ratio": round(fg_ratio, 4),
    }
    return Image.fromarray(out, mode="RGBA"), info


def normalize_cell(tray_rgba: Image.Image, cell_size: int, fill_ratio: float = 0.86) -> Image.Image:
    """Crop transparent margins, scale tray uniformly, and center inside square cell."""
    alpha = np.array(tray_rgba)[:, :, 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0 or len(ys) == 0:
        raise RuntimeError("Cutout failed: no foreground pixels remain after background removal.")

    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    cropped = tray_rgba.crop((x0, y0, x1, y1))

    cw, ch = cropped.size
    target_max = int(round(cell_size * fill_ratio))
    scale = target_max / float(max(cw, ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))

    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    ox = (cell_size - nw) // 2
    oy = (cell_size - nh) // 2
    cell.paste(resized, (ox, oy), resized)
    return cell


def build_sheet(cutouts: list[Image.Image], cell_size: int, out_path: Path, quality: int) -> None:
    """Pack 5 normalized cells horizontally into one transparent WebP sprite sheet."""
    sheet = Image.new("RGBA", (cell_size * len(cutouts), cell_size), (0, 0, 0, 0))
    for idx, cutout in enumerate(cutouts):
        cell = normalize_cell(cutout, cell_size=cell_size)
        sheet.paste(cell, (idx * cell_size, 0), cell)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, format="WEBP", quality=quality, method=6, lossless=False)
    size_kb = out_path.stat().st_size / 1024.0
    print(f"[OK] Wrote {out_path.relative_to(ROOT)} ({sheet.size[0]}x{sheet.size[1]}, {size_kb:.1f} KB)")


def build_gas_index() -> None:
    """Create gas/Index.html from index.html with inline base64 WebP sheet and GAS mode flag."""
    src_html = ROOT / "index.html"
    inline_webp = ASSETS_DIR / "ompreng-sheet-inline.webp"
    dest_html = ROOT / "gas" / "Index.html"

    if not src_html.exists():
        print("[SKIP] index.html not found yet; skipping gas/Index.html generation.")
        return
    if not inline_webp.exists():
        raise FileNotFoundError(f"Missing {inline_webp}")

    b64 = base64.b64encode(inline_webp.read_bytes()).decode("ascii")
    data_uri = f"data:image/webp;base64,{b64}"

    html = src_html.read_text(encoding="utf-8")
    target_prop = '--sheet: url("./assets/ompreng-sheet.webp");'
    if target_prop not in html:
        raise RuntimeError(f"Expected `{target_prop}` inside index.html")

    gas_html = html.replace(target_prop, f'--sheet: url("{data_uri}");')
    gas_html = gas_html.replace(
        "window.__MBG_GAS_MODE__ = false;",
        "window.__MBG_GAS_MODE__ = true;",
    )
    dest_html.write_text(gas_html, encoding="utf-8")
    size_kb = dest_html.stat().st_size / 1024.0
    print(f"[OK] Wrote {dest_html.relative_to(ROOT)} ({size_kb:.1f} KB)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build MBG ompreng WebP sprite sheets.")
    parser.add_argument(
        "--pack-gas-only",
        action="store_true",
        help="Only regenerate gas/Index.html from index.html and ompreng-sheet-inline.webp.",
    )
    args = parser.parse_args()

    if args.pack_gas_only:
        build_gas_index()
        return 0

    cutouts = []
    for fname in TRAY_FILES:
        fpath = RAW_DIR / fname
        if not fpath.exists():
            print(f"[ERR] Missing raw image: {fpath}", file=sys.stderr)
            return 1
        with Image.open(fpath) as im:
            cutout, info = remove_white_bg_floodfill(im)
            print(f"[CUT] {fname}: size={im.size}, info={info}")
            cutouts.append(cutout)

    build_sheet(cutouts, cell_size=500, out_path=ASSETS_DIR / "ompreng-sheet.webp", quality=82)
    build_sheet(cutouts, cell_size=400, out_path=ASSETS_DIR / "ompreng-sheet-inline.webp", quality=76)

    if (ROOT / "index.html").exists():
        build_gas_index()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
