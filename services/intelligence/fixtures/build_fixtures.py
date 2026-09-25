from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent


BANNER = "DEMO - SAMPLE - NOT A LEGAL CERTIFICATE"


def demo_lines(*, serial: str, capacity: str, include_serial: bool = True) -> list[str]:
    lines = [
        BANNER,
        "LM Smart prototype nameplate / supporting document",
        "Business: Om Demo Traders",
        "Instrument type: Electronic weighing machine",
        "Manufacturer: DemoTech Instruments",
        "Model: LM-500",
    ]
    if include_serial:
        lines.append(f"Serial No: {serial}")
    lines.extend(
        [
            f"Max Capacity: {capacity}",
            "Min Capacity: 0.1 kg",
            "Certificate No: CERT-DEMO-0001",
            "Verification date: 15 Mar 2026",
            "Valid until: 14 Mar 2027",
            BANNER,
        ]
    )
    return lines


def write_pdf(path: Path, lines: list[str]) -> None:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_left_margin(15)
    pdf.set_right_margin(15)
    pdf.set_font("Helvetica", size=12)
    for line in lines:
        style = "B" if "DEMO" in line else ""
        pdf.set_font("Helvetica", style=style, size=12)
        pdf.cell(w=180, h=8, text=line, new_x="LMARGIN", new_y="NEXT")
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(path))


def write_png(path: Path, lines: list[str], *, rotate: int = 0) -> None:
    image = Image.new("RGB", (900, 640), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    y = 24
    for line in lines:
        draw.text((32, y), line, fill=(20, 20, 20), font=font)
        y += 28
    if rotate:
        image = image.rotate(rotate, expand=True, fillcolor="white")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")


def main() -> None:
    write_pdf(ROOT / "demo_clear.pdf", demo_lines(serial="SIH-DEMO-001", capacity="30 kg"))
    write_pdf(ROOT / "demo_mismatch.pdf", demo_lines(serial="SIH-DEMO-007", capacity="500 kg"))
    write_pdf(ROOT / "demo_missing_serial.pdf", demo_lines(serial="SIH-DEMO-001", capacity="30 kg", include_serial=False))
    write_png(ROOT / "demo_clear.png", demo_lines(serial="SIH-DEMO-001", capacity="30 kg"))
    write_png(ROOT / "demo_rotated.png", demo_lines(serial="SIH-DEMO-001", capacity="30 kg"), rotate=12)
    (ROOT / "demo_clear.txt").write_text("\n".join(demo_lines(serial="SIH-DEMO-001", capacity="30 kg")), encoding="utf-8")


if __name__ == "__main__":
    main()
