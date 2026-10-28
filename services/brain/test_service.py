import os,base64,io,json
os.environ['BRAIN_API_TOKEN']='local-test-token'
from fastapi.testclient import TestClient
from app import app
from samples import frame
client=TestClient(app)
def frames():
    result=[]
    for i in range(16):
        buffer=io.BytesIO();frame('moving-right',i*3).save(buffer,format='JPEG',quality=80)
        result.append('data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode())
    return result
assert client.get('/health').status_code==200
assert client.post('/perceive',json={'frames':frames()}).status_code==401
assert client.post('/perceive',headers={'Authorization':'Bearer local-test-token'},json={'frames':['invalid']*16}).status_code==400
response=client.post('/perceive',headers={'Authorization':'Bearer local-test-token'},json={'frames':frames()})
assert response.status_code==200,response.text
body=response.json();assert body['mode']=='live' and len(body['embedding'])==1024 and len(body['observations'])==3
print('PASS: health, authentication, invalid frames, real live V-JEPA encoding')
print('Live encode time:',round(body['elapsedMs']),'ms; nearest reference:',body['observations'][0]['label'])
