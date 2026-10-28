"""Authenticated perception worker. Run with one process; weights are loaded lazily."""
import base64, io, json, os, secrets, threading
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError
from model import encode, compare, MODEL, PREPROCESSING

app=FastAPI(docs_url=None,redoc_url=None)
lock=threading.Lock()
class Request(BaseModel):
    frames:list[str]=Field(min_length=16,max_length=16)

@app.get('/health')
def health(): return {'ok':True,'model':MODEL}

@app.post('/perceive')
def perceive(body:Request,authorization:str=Header(default='')):
    token=os.environ.get('BRAIN_API_TOKEN','')
    if not token or not secrets.compare_digest(authorization,f'Bearer {token}'): raise HTTPException(401,'Unauthorized')
    if not lock.acquire(blocking=False): raise HTTPException(429,'Perception is busy',headers={'Retry-After':'30'})
    try:
        frames=[]
        for data in body.frames:
            if len(data)>90000 or not data.startswith('data:image/jpeg;base64,'): raise HTTPException(400,'Invalid JPEG frame')
            try:
                image=Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[1],validate=True)))
                if image.size!=(256,256): raise HTTPException(400,'Frames must be 256x256')
                frames.append(image.convert('RGB'))
            except (ValueError,UnidentifiedImageError): raise HTTPException(400,'Invalid image')
        path=Path(__file__).parent/'references.json'
        if not path.exists(): raise HTTPException(503,'Generate reference embeddings with record.py first')
        refs=json.loads(path.read_text())
        vector,elapsed,revision=encode(frames)
        if refs['revision']!=revision: raise HTTPException(503,'Reference/model revision mismatch')
        return {'model':MODEL,'revision':revision,'mode':'live','elapsedMs':elapsed,'preprocessing':PREPROCESSING,'observations':compare(vector,refs['vectors']),'embedding':vector.tolist()}
    finally: lock.release()
