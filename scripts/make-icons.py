"""Regenerate the native extension icons. Only this optional build step needs Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parents[1] / "extension" / "icons"
out.mkdir(parents=True, exist_ok=True)
scale = 4
im = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(im)
def box(values):
    return tuple(round(value * scale) for value in values)
draw.rounded_rectangle(box((2, 2, 126, 126)), radius=28 * scale, fill="#21192f")
draw.rounded_rectangle(box((18, 22, 110, 96)), radius=15 * scale, fill="#a78bfa")
draw.polygon([box((30, 88)), box((30, 112)), box((58, 92))], fill="#a78bfa")
font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 42 * scale)
draw.text(box((31, 27)), "EN", font=font, fill="#21192f")
draw.rounded_rectangle(box((76, 88, 114, 100)), radius=6 * scale, fill="#68dcc5")
for size in (16, 32, 48, 128):
    im.resize((size, size), Image.Resampling.LANCZOS).save(out / f"icon{size}.png")
print("Generated four local extension icons.")
