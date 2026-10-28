"""Generate original, redistributable sample videos. These pixels are synthetic, not model output."""
from pathlib import Path
import numpy as np
import imageio.v2 as imageio
from PIL import Image, ImageDraw
OUT = Path(__file__).resolve().parents[2] / 'public' / 'lab'

def frame(label, index, size=256):
    image = Image.new('RGB',(size,size),(232,228,244)); draw=ImageDraw.Draw(image)
    for x in range(0,size,16):
        for y in range(0,size,16): draw.ellipse((x,y,x+1,y+1), fill=(201,200,208))
    # A tiny robot traverses an original abstract scene.
    x = 40 + round(index/47*176) if label=='moving-right' else 216-round(index/47*176) if label=='moving-left' else 128
    draw.rounded_rectangle((x-17,111,x+17,141),radius=8,fill=(81,110,83))
    draw.rounded_rectangle((x-11,117,x+11,127),radius=3,fill=(224,239,211))
    draw.ellipse((x-11,137,x-3,145),fill=(47,66,49)); draw.ellipse((x+3,137,x+11,145),fill=(47,66,49))
    draw.line((22,150,234,150),fill=(172,178,164),width=1)
    return image

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    for label in ['moving-right','moving-left','stationary']:
        imageio.mimwrite(OUT/f'{label}.mp4',[np.array(frame(label,i)) for i in range(48)],fps=12,codec='libx264',quality=8,macro_block_size=16)
        print('Generated', label)
