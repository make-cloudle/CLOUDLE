"""캐릭터 PNG(약 150px)를 고해상도 화면용 @2x·@3x로 만든다.

원본은 그대로 두고 `<name>@2x.png`, `<name>@3x.png`를 옆에 만든다.
- 투명 가장자리가 검게 번지지 않게 premultiplied alpha(RGBa)로 리사이즈
- Lanczos 확대 후 약한 언샤프 마스크로 윤곽만 살짝 정리
원본보다 디테일이 늘어나지는 않는다. 더 선명하게 하려면 큰 원본 이미지로 교체해야 한다.

실행 (cmd):  backend\\rag-service\\.venv\\Scripts\\python frontend\\scripts\\upscale-characters.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

DIR = Path(__file__).resolve().parent.parent / "public" / "characters"

for src in sorted(DIR.glob("*.png")):
    if "@" in src.stem:
        continue
    im = Image.open(src).convert("RGBA")
    for scale in (2, 3):
        size = (im.width * scale, im.height * scale)
        big = im.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
        r, g, b, a = big.split()
        rgb = Image.merge("RGB", (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        out = Image.merge("RGBA", (*rgb.split(), a))
        out.save(src.with_name(f"{src.stem}@{scale}x.png"), optimize=True)
    print(src.name, im.size)
