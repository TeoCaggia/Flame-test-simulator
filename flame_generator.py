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
REAGENT_PICTURES = ROOT / "files" / "pictures"
VIDEOS = ROOT / "files" / "videos"
VIDEO_THUMBNAILS = ROOT / "files" / "video_thumbnails"
EXPERIMENTAL_SPECTRA = ROOT / "files" / "spectral_sources" / "definitivo"
EXPERIMENTAL_FILES = {
    "Li": "Li_litio.csv",
    "B": "B_boro.csv",
    "K": "K_potassio.csv",
    "Ca": "Ca_calcio.csv",
    "Cu": "Cu_rame.csv",
    "Sr": "Sr_stronzio.csv",
    "Ba": "Ba_bario.csv",
}
VIEWER_EXCLUDED_ELEMENTS = {"Fe"}


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
    neutral_background = ASSETS / "reagent_backgrounds" / "neutral.png"
    if not neutral_background.is_file():
        raise ValueError(f"Missing neutral background: {neutral_background}")
    data["neutralBackgroundImage"] = (
        "data:image/png;base64,"
        + base64.b64encode(neutral_background.read_bytes()).decode("ascii")
    )
    symbols = {item["symbol"] for item in data["elements"]}
    if element not in symbols:
        raise ValueError(f"Unknown element: {element}. Choose from {', '.join(sorted(symbols))}.")
    for item in data["elements"]:
        if not item.get("reagentName") or not item.get("reagentFormula"):
            raise ValueError(f"Missing reagent label data for {item['symbol']}")
        if not item.get("spectrumDescription"):
            raise ValueError(f"Missing spectrum description for {item['symbol']}")
        background_path = ASSETS / "reagent_backgrounds" / f"{item['symbol']}.png"
        if not background_path.is_file():
            raise ValueError(f"Missing reagent background for {item['symbol']}: {background_path}")
        item["backgroundImage"] = (
            "data:image/png;base64,"
            + base64.b64encode(background_path.read_bytes()).decode("ascii")
        )
        reagent_picture = REAGENT_PICTURES / f"{item['symbol']}.png"
        if reagent_picture.is_file():
            item["reagentImage"] = (
                "data:image/png;base64,"
                + base64.b64encode(reagent_picture.read_bytes()).decode("ascii")
            )
        video_path = VIDEOS / f"{item['symbol']}.mp4"
        if video_path.is_file():
            thumbnail_path = VIDEO_THUMBNAILS / f"{item['symbol']}.png"
            if not thumbnail_path.is_file():
                raise ValueError(f"Missing video thumbnail for {item['symbol']}: {thumbnail_path}")
            item["videoSource"] = os.path.relpath(video_path, output.parent).replace(os.sep, "/")
            item["videoThumbnail"] = (
                "data:image/png;base64,"
                + base64.b64encode(thumbnail_path.read_bytes()).decode("ascii")
            )
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
                    or not all(0 < peak['strength'] <= 1 and peak['sigma_nm'] > 0 for peak in peaks)
                    or not all(380 <= marker['nm'] <= 850 for marker in component['markers'])
                    or not 0 < component.get('scale', 0) <= 1
                    or not component.get('source') or not component.get('method')):
                raise ValueError(f"Invalid spectral component: {item['symbol']} / {component['id']}")
    palette = data.get('spectralPalette', [])
    if [row[0] for row in palette] != list(range(380, 771)):
        raise ValueError('Missing wavelength-calibrated reference palette')
    data["defaultElement"] = element
    css = (ASSETS / "style.css").read_text(encoding="utf-8")
    syne_font = base64.b64encode((ASSETS / "fonts" / "Syne.ttf").read_bytes()).decode("ascii")
    fira_code_font = base64.b64encode((ASSETS / "fonts" / "FiraCode.ttf").read_bytes()).decode("ascii")
    css = css.replace("__SYNE_FONT__", syne_font).replace("__FIRA_CODE_FONT__", fira_code_font)
    sample_rod = base64.b64encode((ASSETS / "sample_rod.png").read_bytes()).decode("ascii")
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    html = (ASSETS / "index.html").read_text(encoding="utf-8")
    replacements = {
        "__STYLE__": css,
        "__DATA__": payload,
        "__SCRIPT__": (ASSETS / "viewer.js").read_text(encoding="utf-8"),
        "__FONT_LICENSE__": "\n\n".join(
            "\n".join(
                line.rstrip()
                for line in (ASSETS / "fonts" / name).read_text(encoding="utf-8").splitlines()
            )
            for name in ("OFL.txt", "OFL-FiraCode.txt")
        ),
        "__SAMPLE_ROD_IMAGE__": sample_rod,
    }
    html = re.sub(r"__(?:STYLE|DATA|SCRIPT|FONT_LICENSE|SAMPLE_ROD_IMAGE)__", lambda m: replacements[m[0]], html)
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
