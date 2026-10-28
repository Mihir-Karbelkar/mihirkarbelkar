"""Generate the portfolio's text-only social card from the current editorial direction."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (1200, 630), '#F8F6F0')
draw = ImageDraw.Draw(image)
font_root = Path('/usr/share/fonts/TTF')
if not (font_root/'DejaVuSans.ttf').exists(): font_root = Path('/usr/share/fonts/truetype/dejavu')
sans = lambda size: ImageFont.truetype(str(font_root/'DejaVuSans.ttf'), size)
serif = lambda size: ImageFont.truetype(str(font_root/'DejaVuSerif.ttf'), size)
draw.text((65, 50), 'Mihir Karbelkar', font=sans(21), fill='#29362F')
draw.text((65, 85), 'Bengaluru, India', font=sans(16), fill='#58665C')
draw.line((65,135,1135,135),fill='#D5D8CE',width=1)
draw.text((65, 185), 'I like figuring things out.', font=serif(57), fill='#29362F')
draw.text((65, 270), 'Then building something', font=serif(57), fill='#29362F')
draw.text((65, 345), 'with it.', font=serif(57), fill='#29362F')
draw.text((65, 470), 'Software, models, maths, and the occasional physical thing.', font=sans(22), fill='#58665C')
draw.text((65, 555), 'mihirkarbelkar.com', font=sans(18), fill='#29362F')
image.save(root/'public/social-card.png', optimize=True)
