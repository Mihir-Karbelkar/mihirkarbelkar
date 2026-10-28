"""Produce genuine model recordings and reference vectors from the exact bundled clips."""
import json, hashlib
from datetime import datetime, timezone
from pathlib import Path
import imageio.v2 as imageio
import numpy as np
from PIL import Image
from model import encode, compare, MODEL, PREPROCESSING
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'public'/'lab'
labels=['moving-right','moving-left','stationary']
embeddings={}; outputs={}
for label in labels:
    path=OUT/f'{label}.mp4'
    frames=imageio.mimread(path, memtest='128MB')
    chosen=np.linspace(0,len(frames)-1,16,endpoint=False).astype(int)
    # Match browser sampling's JPEG quality 0.8, including JPEG decode.
    import io
    inputs=[]
    for i in chosen:
        buffer=io.BytesIO();Image.fromarray(frames[i]).save(buffer,format='JPEG',quality=80);buffer.seek(0);inputs.append(Image.open(buffer).convert('RGB'))
    vector,elapsed,revision=encode(inputs)
    embeddings[label]=vector.tolist();outputs[label]=(elapsed,revision)
    print(label, 'encoded:',len(vector),'dimensions in',round(elapsed),'ms',flush=True)
for label in labels:
    elapsed,revision=outputs[label]
    recording={'schemaVersion':1,'clip':f'/lab/{label}.mp4','generatedAt':datetime.now(timezone.utc).isoformat(),'provenance':{'model':MODEL,'revision':revision,'preprocessing':PREPROCESSING,'source':f'Original synthetic video, samples.py; SHA256 {hashlib.sha256((OUT/f"{label}.mp4").read_bytes()).hexdigest()}'},'result':{'model':MODEL,'revision':revision,'mode':'recorded','elapsedMs':elapsed,'preprocessing':PREPROCESSING,'observations':compare(np.array(embeddings[label]),embeddings),'embedding':embeddings[label]}}
    (OUT/f'{label}.json').write_text(json.dumps(recording,indent=2)+'\n')
(OUT/'recordings.json').write_text(json.dumps({label:f'/lab/{label}.json' for label in labels},indent=2)+'\n')
# Server references carry the same provenance; public recordings also suffice to reconstruct them.
(Path(__file__).parent/'references.json').write_text(json.dumps({'model':MODEL,'revision':outputs[labels[0]][1],'vectors':embeddings}))
