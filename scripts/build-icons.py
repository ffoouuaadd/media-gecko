from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "assets" / "gecko-source.png").convert("RGBA")
alpha = source.getchannel("A").point(lambda value: 255 if value > 72 else 0)
bounds = alpha.getbbox()
symbol = Image.new("RGBA", source.size, (255, 255, 255, 0))
symbol.putalpha(alpha)
symbol = symbol.crop(bounds)

def fitted(size, foreground, background=None, padding=0.10):
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    maximum = int(size * (1 - padding * 2))
    mark = symbol.copy()
    mark.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    colored = Image.new("RGBA", mark.size, foreground)
    colored.putalpha(mark.getchannel("A"))
    canvas.alpha_composite(colored, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas

fitted(1024, (255, 255, 255, 255)).save(root / "assets" / "gecko-main.png")
fitted(256, (255, 255, 255, 255)).save(root / "assets" / "gecko-sidebar.png")
fitted(1024, (20, 20, 20, 255)).save(root / "assets" / "gecko-monochrome.png")
app_icon = fitted(512, (255, 255, 255, 255), (255, 78, 24, 255), 0.14)
app_icon.save(root / "assets" / "gecko-app.png")
app_icon.save(root / "assets" / "app-icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
fitted(64, (255, 255, 255, 255), (255, 78, 24, 255), 0.14).save(root / "public" / "favicon.png")
fitted(128, (255, 78, 24, 255), None, 0.08).save(root / "public" / "gecko-sidebar.png")
