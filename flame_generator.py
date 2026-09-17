"""Build a self-contained, offline flame-test viewer using only Python's stdlib."""
import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "files" / "viewer"
DATA = ROOT / "files" / "elements.json"


def build(output: Path, element: str = "Na") -> Path:
    data = json.loads(DATA.read_text(encoding="utf-8"))
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
        background_path = ASSETS / "reagent_backgrounds" / f"{item['symbol']}.png"
        if not background_path.is_file():
            raise ValueError(f"Missing reagent background for {item['symbol']}: {background_path}")
        item["backgroundImage"] = (
            "data:image/png;base64,"
            + base64.b64encode(background_path.read_bytes()).decode("ascii")
        )
        lines = item["lines_nm"]
        bands = item.get("molecular_bands", [])
        if (not lines and not bands) or lines != sorted(set(lines)) or not all(380 <= n <= 800 for n in lines):
            raise ValueError(f"Invalid visible spectral lines for {item['symbol']}")
        strengths = item.get("line_strengths", [])
        if len(strengths) != len(lines) or not all(0 < value <= 1 for value in strengths):
            raise ValueError(f"Invalid spectral line strengths for {item['symbol']}")
        band_centers = [band.get("center_nm") for band in bands]
        if (band_centers != sorted(set(band_centers))
                or not all(380 <= center <= 800 for center in band_centers)
                or not all(band.get("sigma_nm", 0) > 0 and 0 < band.get("strength", 0) <= 1 for band in bands)):
            raise ValueError(f"Invalid molecular emission bands for {item['symbol']}")
        background = item.get("background_lines_nm", [])
        background_strengths = item.get("background_line_strengths", [])
        if (background != sorted(set(background)) or not all(380 <= n <= 800 for n in background)
                or len(background_strengths) != len(background)
                or not all(0 < value <= 1 for value in background_strengths)):
            raise ValueError(f"Invalid background spectral lines for {item['symbol']}")
    data["defaultElement"] = element
    css = (ASSETS / "style.css").read_text(encoding="utf-8")
    font = base64.b64encode((ASSETS / "fonts" / "Syne.ttf").read_bytes()).decode("ascii")
    css = css.replace("__SYNE_FONT__", font)
    sample_rod = base64.b64encode((ASSETS / "sample_rod.png").read_bytes()).decode("ascii")
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    html = (ASSETS / "index.html").read_text(encoding="utf-8")
    replacements = {
        "__STYLE__": css,
        "__DATA__": payload,
        "__SCRIPT__": (ASSETS / "viewer.js").read_text(encoding="utf-8"),
        "__FONT_LICENSE__": (ASSETS / "fonts" / "OFL.txt").read_text(encoding="utf-8"),
        "__SAMPLE_ROD_IMAGE__": sample_rod,
    }
    html = re.sub(r"__(?:STYLE|DATA|SCRIPT|FONT_LICENSE|SAMPLE_ROD_IMAGE)__", lambda m: replacements[m[0]], html)
    output = output.expanduser().resolve()
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
