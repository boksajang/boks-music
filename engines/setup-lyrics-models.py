"""Download immutable public model snapshots; never run repository code."""
import argparse, hashlib, json, os, pathlib, urllib.request, sys
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
MODELS={
 'qwen':('Qwen/Qwen3-ForcedAligner-0.6B-hf','c07281df297b9905d24a508279258cccf987a064'),
 'asr-1.7b':('Qwen/Qwen3-ASR-1.7B-hf','bcd2b5b7f32b480ab5790554cfa8347f246a14f3')}
def emit(**data): print(json.dumps(data,ensure_ascii=False),flush=True)
def install(root):
 for name,(repo,revision) in MODELS.items():
  folder=root/name;folder.mkdir(parents=True,exist_ok=True)
  with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true') as r:meta=json.load(r)
  records=[]
  for item in meta['siblings']:
   filename=item['rfilename']
   if not (filename.endswith(('.json','.jinja','.safetensors','.config','.txt')) or filename=='README.md'):continue
   target=(folder/filename).resolve()
   if target.parent!=folder.resolve():raise RuntimeError('Unsafe model filename: '+filename)
   expected=item.get('lfs',{}).get('sha256');size=item.get('size');records.append(dict(filename=filename,sha256=expected,bytes=size))
   if target.exists() and (not size or target.stat().st_size==size) and (not expected or hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==expected):continue
   partial=target.with_suffix(target.suffix+'.partial');digest=hashlib.sha256();received=0;last=0
   emit(type='progress',stage=f'{name} / {filename} 다운로드 중')
   try:
    with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{revision}/{filename}',timeout=120) as response,partial.open('wb') as out:
     while chunk:=response.read(4*1024*1024):
      out.write(chunk);digest.update(chunk);received+=len(chunk)
      if received-last>=32*1024*1024:
       emit(type='progress',stage=f'{name} / {filename} 다운로드 중',downloadedBytes=received,totalBytes=size,**({'progress':received/size*100} if size else {}));last=received
    if (size and received!=size) or (expected and digest.hexdigest()!=expected):raise RuntimeError('Model size/SHA-256 mismatch: '+filename)
    partial.replace(target)
   finally:
    partial.unlink(missing_ok=True)
  (folder/'boks-model-manifest.json').write_text(json.dumps(dict(repo=repo,revision=revision,files=records),indent=2),encoding='utf-8')
 emit(type='result',modelRoot=str(root.resolve()))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--model-root',required=True);a=p.parse_args();install(pathlib.Path(a.model_root))
