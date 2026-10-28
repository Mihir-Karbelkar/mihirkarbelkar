import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'public/lab/recordings.json').read_text())
vectors={};model=None;revision=None
for label,url in manifest.items():
    record=json.loads((root/'public'/url.lstrip('/')).read_text())
    if model is not None and (model!=record['result']['model'] or revision!=record['result']['revision']):raise ValueError('Mixed model revisions')
    model=record['result']['model'];revision=record['result']['revision'];vectors[label]=record['result']['embedding']
if not vectors:raise ValueError('No verified recordings')
(Path(__file__).parent/'references.json').write_text(json.dumps({'model':model,'revision':revision,'vectors':vectors}))
print('Restored reference vectors for',len(vectors),'clips')
