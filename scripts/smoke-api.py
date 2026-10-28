"""Verify the local website/API. Never sends email or calls hosted LLM providers."""
import urllib.request,urllib.error,json,base64,io,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services'/'brain'))
from samples import frame
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:4321'
def request(path,body=None,origin=True):
    headers={'Content-Type':'application/json'}
    if origin: headers['Origin']=base
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=95) as response:return response.status,response.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
for path in ['/','/about','/blog','/blog/first-post','/rss.xml','/lab/brain','/lab/theme','/projects/robot-fleet','/politics/essays','/puns','/social-card.png','/lab/moving-right.mp4']:
    status,_=request(path);assert status==200,(path,status)
assert request('/api/chat',{'messages':[]})[0]==400
assert request('/api/chat',{'messages':[]},origin=False)[0]==403
assert request('/api/contact',{'name':'a','email':'bad','message':'short'})[0]==400
status,raw=request('/api/config');config=json.loads(raw);assert not config['contact'] and not config['chat']
if config['perception']:
    frames=[]
    for i in range(16):
        buffer=io.BytesIO();frame('moving-right',i*3).save(buffer,format='JPEG',quality=80);frames.append('data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode())
    status,raw=request('/api/perceive',{'frames':frames});assert status==200,(status,raw)
    result=json.loads(raw);assert result['mode']=='live' and len(result['embedding'])==1024
    print('Live perception through website proxy:',round(result['elapsedMs']),'ms')
print('PASS: 12 routes, origin checks, input validation, unconfigured services, optional live proxy')
