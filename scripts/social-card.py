"""Generate the portfolio's text-only social card (headline + intro) on the cream palette."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (1200, 630), '#F7F1E6')
draw = ImageDraw.Draw(image)
font_root = Path('/usr/share/fonts/TTF')
if not (font_root/'DejaVuSans.ttf').exists(): font_root = Path('/usr/share/fonts/truetype/dejavu')
sans = lambda size: ImageFont.truetype(str(font_root/'DejaVuSans.ttf'), size)
serif = lambda size: ImageFont.truetype(str(font_root/'DejaVuSerif.ttf'), size)
ink, muted, line, accent = '#2E2722', '#6E6259', '#E6DCCB', '#A4404F'
draw.text((65, 50), 'Mihir Karbelkar', font=sans(22), fill=ink)
draw.text((65, 86), 'Bengaluru, India · Open to contract', font=sans(16), fill=muted)
draw.line((65,135,1135,135),fill=line,width=1)
draw.text((65, 180), 'LLM fine-tuning', font=serif(62), fill=ink)
draw.text((65, 262), '& AI engineer.', font=serif(62), fill=ink)
draw.text((65, 380), 'Domain adaptation · Evals · Training data · Ex-Razorpay', font=sans(24), fill=accent)
draw.text((65, 425), 'I fine-tune and evaluate open-weight LLMs for teams that need a model', font=sans(21), fill=muted)
draw.text((65, 455), 'to know their domain without losing its general skills.', font=sans(21), fill=muted)
draw.text((65, 555), 'mihirkarbelkar.com', font=sans(18), fill=ink)
image.save(root/'public/social-card.png', optimize=True)
