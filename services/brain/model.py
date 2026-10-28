"""Small, reproducible V-JEPA 2 encoder wrapper; no generated labels or fake outputs."""
import os, time
from functools import lru_cache
from pathlib import Path
import numpy as np
import torch
from transformers import AutoModel, AutoVideoProcessor

MODEL = 'facebook/vjepa2-vitl-fpc64-256'
PREPROCESSING = '16 uniform frames; center-square crop; 256x256 RGB JPEG; AutoVideoProcessor; mean token pool; L2 normalization'
CACHE = str(Path(__file__).parent / '.cache')

@lru_cache(maxsize=1)
def load():
    revision = os.environ.get('VJEPA_REVISION', 'b3c1679b7c34d3255ef3547f27c7b226aefab26f')
    if not revision:
        from huggingface_hub import HfApi
        revision = HfApi().model_info(MODEL).sha
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    print(f'Loading {MODEL}@{revision} on {device}', flush=True)
    snapshot=Path(CACHE)/'models--facebook--vjepa2-vitl-fpc64-256'/'snapshots'/revision
    source=str(snapshot) if (snapshot/'model.safetensors').exists() else MODEL
    processor = AutoVideoProcessor.from_pretrained(source, revision=revision, cache_dir=CACHE)
    model = AutoModel.from_pretrained(source, revision=revision, cache_dir=CACHE, attn_implementation='sdpa').to(device).eval()
    return processor, model, revision, device

def encode(frames):
    processor, model, revision, device = load()
    start = time.perf_counter()
    video = np.stack([np.array(frame.convert('RGB')) for frame in frames])
    inputs = processor(videos=video, return_tensors='pt').to(device)
    with torch.inference_mode():
        output = model(**inputs, skip_predictor=True)
        embedding = torch.nn.functional.normalize(output.last_hidden_state.mean(dim=1), dim=-1)[0].cpu().float().numpy()
    return embedding, (time.perf_counter()-start)*1000, revision

def compare(embedding, references):
    return sorted([{'label':name, 'similarity':float(np.clip(np.dot(embedding, np.array(vector)), -1, 1)), 'timestamp':0} for name,vector in references.items()], key=lambda x:x['similarity'], reverse=True)
