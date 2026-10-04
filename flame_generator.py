"""Build an offline flame-test viewer using only Python's stdlib."""
import argparse
import base64
import csv
import io
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "files" / "viewer"
DATA = ROOT / "files" / "elements.json"
VIDEOS = ROOT / "files" / "videos"
VIDEO_THUMBNAILS = ROOT / "files" / "video_thumbnails"
EXPERIMENTAL_SPECTRA = ROOT / "files" / "spectral_sources" / "definitivo"
EXPERIMENTAL_FILES = {
    "Li": "Li_litio.csv",
    "B": "B_boro.csv",
    "Na": "Na.csv",
    "K": "K_potassio.csv",
    "Ca": "Ca_calcio.csv",
    "Cu": "Cu_rame.csv",
    "Sr": "Sr_stronzio.csv",
    "Ba": "Ba_bario.csv",
}
VIEWER_EXCLUDED_ELEMENTS = {"Fe"}
# Provenance fields kept in elements.json for scripts/rebuild_spectra.cjs; the viewer never reads them.
VIEWER_COMPONENT_FIELDS = ("id", "kind", "peaks", "scale")
# Longest side of each embedded raster, sized to its largest on-screen use.
# Scene textures are sampled with mipmaps, so 1024 px keeps all visible detail.
IMAGE_LIMITS = {"texture": 1024, "thumbnail": 720}

try:
    from PIL import Image
except ImportError:  # Pillow is optional: without it the PNGs are embedded as-is.
    Image = None


def image_data_uri(path: Path, kind: str) -> str:
    """Embed a raster as WebP when Pillow is available, else as the source PNG."""
    if Image is None:
        return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    with Image.open(path) as source:
        image = source.convert("RGBA" if "A" in source.getbands() else "RGB")
        image.thumbnail((IMAGE_LIMITS[kind],) * 2, Image.LANCZOS)
        if image.mode == "RGBA" and image.getextrema()[3][0] == 255:
            image = image.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=84, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def load_experimental_spectrum(path: Path) -> list[list[float]]:
    if not path.is_file():
        raise ValueError(f"Missing experimental spectrum: {path}")
    source = "\n".join(
        line for line in path.read_text(encoding="utf-8").splitlines()
        if not line.startswith("#")
    )
    points = [
        [round(float(row["wavelength_nm"]), 3), round(float(row["intensity_counts"]), 5)]
        for row in csv.DictReader(io.StringIO(source))
        if 380 <= float(row["wavelength_nm"]) <= 850
    ]
    wavelengths = [point[0] for point in points]
    if len(points) < 2 or wavelengths != sorted(set(wavelengths)):
        raise ValueError(f"Invalid experimental spectrum: {path}")
    return points


def build(output: Path, element: str = "Na") -> Path:
    output = output.expanduser().resolve()
    data = json.loads(DATA.read_text(encoding="utf-8"))
    data["elements"] = [
        item
        for item in data["elements"]
        if item["symbol"] not in VIEWER_EXCLUDED_ELEMENTS
    ]
    symbols = {item["symbol"] for item in data["elements"]}
    if element not in symbols:
        raise ValueError(f"Unknown element: {element}. Choose from {', '.join(sorted(symbols))}.")
    for item in data["elements"]:
        if not item.get("reagentName") or not item.get("reagentFormula"):
            raise ValueError(f"Missing reagent label data for {item['symbol']}")
        if not item.get("spectrumDescription"):
            raise ValueError(f"Missing spectrum description for {item['symbol']}")
        video_path = VIDEOS / f"{item['symbol']}.mp4"
        if video_path.is_file():
            thumbnail_path = VIDEO_THUMBNAILS / f"{item['symbol']}.png"
            if not thumbnail_path.is_file():
                raise ValueError(f"Missing video thumbnail for {item['symbol']}: {thumbnail_path}")
            item["videoSource"] = os.path.relpath(video_path, output.parent).replace(os.sep, "/")
            item["videoThumbnail"] = image_data_uri(thumbnail_path, "thumbnail")
        experimental_file = EXPERIMENTAL_FILES.get(item["symbol"])
        if experimental_file:
            item["experimentalSpectrum"] = load_experimental_spectrum(
                EXPERIMENTAL_SPECTRA / experimental_file
            )
        components = item.get("spectral_components", [])
        if not components:
            raise ValueError(f"Missing spectral components for {item['symbol']}")
        for component in components:
            peaks = component['peaks']
            wavelengths = [peak['nm'] for peak in peaks]
            if (wavelengths != sorted(set(wavelengths))
                    or not all(380 <= nm <= 850 for nm in wavelengths)
                    or not all(0 < peak['strength'] <= 1
                               and (component.get('kind') == 'atomic' or peak.get('sigma_nm', 0) > 0)
                               for peak in peaks)
                    or not 0 <= component.get('scale', -1) <= 1):
                raise ValueError(f"Invalid spectral component: {item['symbol']} / {component['id']}")
        item["spectral_components"] = [
            {field: component[field] for field in VIEWER_COMPONENT_FIELDS} for component in components
        ]
    palette = data.get('spectralPalette', [])
    if [row[0] for row in palette] != list(range(380, 771)):
        raise ValueError('Missing wavelength-calibrated reference palette')
    data["defaultElement"] = element
    texture_files = {"wood": "dark-walnut-albedo.png", **{
        name: f"{name}.png" for name in ("metal", "ceramic", "rubber", "cork", "paper", "salt")
    }}
    data["sceneTextures"] = {
        name: image_data_uri(ASSETS / "textures" / filename, "texture")
        for name, filename in texture_files.items()
    }
    css = (ASSETS / "style.css").read_text(encoding="utf-8")
    syne_font = base64.b64encode((ASSETS / "fonts" / "Syne.ttf").read_bytes()).decode("ascii")
    fira_code_font = base64.b64encode((ASSETS / "fonts" / "FiraCode.ttf").read_bytes()).decode("ascii")
    css = css.replace("__SYNE_FONT__", syne_font).replace("__FIRA_CODE_FONT__", fira_code_font)
    def module_uri(source: str) -> str:
        return "data:text/javascript;base64," + base64.b64encode(source.encode("utf-8")).decode("ascii")

    three = ASSETS / "vendor" / "three"
    imports_3d = json.dumps({"imports": {
        "three/core": module_uri((three / "three.core.js").read_text(encoding="utf-8")),
        "three": module_uri((three / "three.module.js").read_text(encoding="utf-8").replace("'./three.core.js'", "'three/core'")),
        "three/RoomEnvironment": module_uri((three / "RoomEnvironment.js").read_text(encoding="utf-8")),
        "bunsen/flame": module_uri((ASSETS / "bunsen_flame.js").read_text(encoding="utf-8")),
    }})
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    html = (ASSETS / "index.html").read_text(encoding="utf-8")
    replacements = {
        "__STYLE__": css,
        "__DATA__": payload,
        "__SCRIPT__": (ASSETS / "viewer.js").read_text(encoding="utf-8"),
        "__3D_IMPORTS__": imports_3d,
        "__3D_MODULE__": module_uri((ASSETS / "bunsen_scene.js").read_text(encoding="utf-8")),
        "__FONT_LICENSE__": "\n\n".join(
            "\n".join(
                line.rstrip()
                for line in (ASSETS / "fonts" / name).read_text(encoding="utf-8").splitlines()
            )
            for name in ("OFL.txt", "OFL-FiraCode.txt")
        ),
    }
    html = re.sub(r"__(?:STYLE|DATA|SCRIPT|3D_IMPORTS|3D_MODULE|FONT_LICENSE)__", lambda m: replacements[m[0]], html)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "output" / "flame_viewer.html")
    parser.add_argument("--element", default="Na", help="Initial element symbol (default: Na)")
    args = parser.parse_args()
    try:
        output = build(args.output, args.element)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Generation failed: {error}\n")
    print(f"Generated: {output}")


if __name__ == "__main__":
    main()
