"""Lyric line-start worker. JSON stdin and JSONL stdout.
main() runs the lyrics-first estimate (lyric_onset_alignment.py) and the independent
ASR-anchored estimate (lyric_asr_alignment.py) with one loaded forced aligner, then keeps a
start automatic only by the hybrid decision; primary() is the shared forced-aligner call.
No ASR rewriting of lyrics and no invented equal-duration timing.
"""
import contextlib, functools, gc, json, math, os, sys, traceback, unicodedata
from pathlib import Path
OUTPUT=sys.stdout
if hasattr(OUTPUT,'reconfigure'):OUTPUT.reconfigure(encoding='utf-8')
if hasattr(sys.stdin,'reconfigure'):sys.stdin.reconfigure(encoding='utf-8')
def emit(kind,**data):OUTPUT.write(json.dumps(dict(type=kind,**data),ensure_ascii=False,allow_nan=False)+'\n');OUTPUT.flush()
def progress(stage,**data):emit('progress',stage=stage,**data)
def normalized(text):return ''.join(c.lower() for c in unicodedata.normalize('NFC',text) if c.isalnum())
# Whole-file decode memory and runtime grow linearly with length; every model call works on
# bounded windows, so length is not a model limit. Electron sends its catalog limit.
DEFAULT_MAX_AUDIO_SECONDS=600
MIN_AUDIO_SECONDS=0.4
def engine_module(name):
 import importlib
 here=str(Path(__file__).resolve().parent)
 if here not in sys.path:sys.path.insert(0,here)
 return importlib.import_module(name)
def asr_module():return engine_module('lyric_asr_alignment')
LANGUAGE_KEYS=('code','asr','aligner')
def resolve_language(value):
 """Engine language names come from the Electron catalog; bare legacy names mean Korean."""
 if value is None or value in ('ko','Korean','korean'):return dict(asr_module().KOREAN)
 if isinstance(value,dict) and all(isinstance(value.get(key),str) and value[key].strip() for key in LANGUAGE_KEYS):return {key:value[key] for key in LANGUAGE_KEYS}
 raise ValueError('현재 가사 정렬이 지원하지 않는 언어입니다.')
def check_request(request):
 lines=request.get('lines');resolve_language(request.get('language'))
 if not isinstance(lines,list) or not lines or len(lines)>500:raise ValueError('가사 행을 확인하세요.')
 if any(not isinstance(row,dict) or not isinstance(row.get('lineId'),str) or not isinstance(row.get('text'),str) or not normalized(row['text']) for row in lines):raise ValueError('가사 행 ID와 텍스트가 필요합니다.')
 if len(set(row['lineId'] for row in lines))!=len(lines) or sum(len(row['text']) for row in lines)>12000:raise ValueError('가사 ID 또는 분량이 올바르지 않습니다.')
 return lines

def qwen_rows(lines,words,timings,scores,duration):
 # Map normalized transcript characters, never interpolate token boundaries.
 expected=''.join(normalized(row['text']) for row in lines);actual=''.join(normalized(w) for w in words)
 if expected!=actual:return [dict(lineId=row['lineId'],start=None,end=None,score=0,flags=['token_mapping_mismatch']) for row in lines]
 spans=[];cursor=0
 for word,timing,score in zip(words,timings,scores):
  size=len(normalized(word));spans.append((cursor,cursor+size,timing,score));cursor+=size
 rows=[];cursor=0;previous=0
 for row in lines:
  end=cursor+len(normalized(row['text']));selected=[item for item in spans if item[0]<end and item[1]>cursor];flags=[]
  if not selected:rows.append(dict(lineId=row['lineId'],start=None,end=None,score=0,flags=['missing_tokens']));cursor=end;continue
  starts=[x[2][0] for x in selected];ends=[x[2][1] for x in selected];start=starts[0];finish=ends[-1]
  if any(not math.isfinite(s) or not math.isfinite(e) or s<0 or e<s or e>duration+0.08 for _,_,(s,e),_ in selected) or any(starts[i]<starts[i-1] or starts[i]<ends[i-1]-0.08 for i in range(1,len(starts))) or start<previous-0.08 or finish<=start:flags.append('nonmonotonic_or_invalid_prediction')
  if selected[0][0]<cursor or selected[-1][1]>end:flags.append('token_crosses_line_boundary')
  score=sum(x[3] for x in selected)/len(selected)
  if score<0.15:flags.append('low_timestamp_probability')
  usable=math.isfinite(start) and math.isfinite(finish) and 0<=start<finish<=duration
  rows.append(dict(lineId=row['lineId'],start=round(start,3) if usable else None,end=round(finish,3) if usable else None,score=round(score,4),flags=flags,rawStart=round(start,3),rawEnd=round(finish,3)))
  previous=max(previous,finish);cursor=end
 return rows

def monotonic_timestamps(log_probs,duration,resolution=0.08):
 """Maximum-probability ordered timestamp classes; never interpolate argmaxes."""
 import numpy as np
 values=np.asarray(log_probs,dtype=np.float64)[:,:int(duration/resolution)+1]
 if values.ndim!=2 or len(values)%2 or not np.isfinite(values).all():raise ValueError('timestamp 확률 행렬이 올바르지 않습니다.')
 count,width=values.shape;history=np.zeros((count,width),np.int32);prior=values[0].copy();indices=np.arange(width)
 for row in range(1,count):
  maxima=np.maximum.accumulate(prior)
  winners=np.maximum.accumulate(np.where(prior==maxima,indices,0))
  # An end must follow its own start; adjacent words may share a boundary.
  shift=row%2
  best=np.concatenate(([-np.inf],maxima[:-1])) if shift else maxima
  history[row]=np.concatenate(([0],winners[:-1])) if shift else winners
  prior=best+values[row]
 index=int(prior.argmax())
 if not np.isfinite(prior[index]):raise ValueError('가사 순서를 만족하는 확률 경로가 없습니다.')
 chosen=np.empty(count,np.int32)
 for row in range(count-1,-1,-1):chosen[row]=index;index=int(history[row,index])
 return chosen*resolution,np.exp(values[np.arange(count),chosen]),chosen

def load_aligner(root,device,folder_name='qwen'):
 import torch
 from transformers import AutoProcessor,AutoModelForTokenClassification
 progress('Qwen 강제 정렬 모델 로딩 중');folder=root/folder_name
 processor=AutoProcessor.from_pretrained(folder,local_files_only=True)
 model=AutoModelForTokenClassification.from_pretrained(folder,local_files_only=True,dtype=torch.bfloat16 if device=='cuda' else torch.float32,attn_implementation='sdpa').to(device).eval()
 return processor,model

def primary(audio,lines,root,device,bundle=None,*,language='Korean',folder_name='qwen'):
 import numpy as np, torch
 processor,model=bundle if bundle is not None else load_aligner(root,device,folder_name)
 progress('Qwen 모델로 선택 구간의 단어 위치 정렬 중' if bundle is not None else 'Qwen 모델로 전체 가사·오디오 정렬 중')
 inputs,word_lists=processor.prepare_forced_aligner_inputs(audio=audio,transcript='\n'.join(row['text'] for row in lines),language=language)
 inputs=inputs.to(device,model.dtype)
 with torch.inference_mode():outputs=model(**inputs)
 mask=inputs['input_ids'][0]==model.config.timestamp_token_id;logits=outputs.logits[0,mask].float();raw=logits.argmax(-1).cpu().numpy()*processor.timestamp_segment_time/1000
 log_probs=logits.log_softmax(-1).cpu().numpy()
 words=word_lists[0]
 if len(raw)!=len(words)*2:raise ValueError('Qwen timestamp 토큰 수가 가사와 일치하지 않습니다.')
 selected,probabilities,classes=monotonic_timestamps(log_probs,len(audio)/16000,processor.timestamp_segment_time/1000)
 timings=selected.reshape(-1,2).tolist();scores=probabilities.reshape(-1,2).mean(-1).tolist()
 rows=qwen_rows(lines,words,timings,scores,len(audio)/16000)
 cursor=0
 for row in rows:
  count=len(processor.split_words_for_alignment(next(line['text'] for line in lines if line['lineId']==row['lineId']),language));stop=cursor+count*2
  row['evidence']={'decoder':'monotonic-log-probability-dp','changedTimestampCount':int(np.count_nonzero(np.abs(selected[cursor:stop]-raw[cursor:stop])>0.001)),'startProbability':float(probabilities[cursor]),'endProbability':float(probabilities[stop-1]),'unconstrainedStart':float(raw[cursor]),'unconstrainedEnd':float(raw[stop-1]),'unconstrainedStartProbability':float(np.exp(log_probs[cursor].max())),'unconstrainedEndProbability':float(np.exp(log_probs[stop-1].max()))};cursor=stop
 del outputs,inputs,logits
 if bundle is None:del model,processor
 gc.collect()
 if device=='cuda':torch.cuda.empty_cache()
 return rows

def window_aligner(audio,aligner,root,device,bundle):
 """align_window(lower, upper, rows) for lyrics_first: clamps the window to the audio and
 returns starts relative to the clamped lower edge."""
 duration=len(audio)/16000
 def align_window(lower,upper,rows):
  lower=max(0.,lower);upper=min(duration,upper)
  try:return lower,upper,aligner(audio[int(lower*16000):int(upper*16000)],rows,root,device,bundle)
  except ValueError as error:
   # Too much text for a short window (e.g. unsung trailing lyrics pushed to the song end) has
   # no ordered timestamp path; those lines stay for review instead of failing the song.
   return lower,upper,[{'lineId':row['lineId'],'start':None,'end':None,'score':0,'flags':['aligner_failed'],'evidence':{'alignerError':str(error)}} for row in rows]
 return align_window

def main():
 request=json.load(sys.stdin);lines=check_request(request);root=Path(request['modelRoot']).resolve();cache=root/'cache'
 for name,folder in {'HF_HOME':cache/'huggingface','TORCH_HOME':cache/'torch','XDG_CACHE_HOME':cache,'NUMBA_CACHE_DIR':cache/'numba'}.items():folder.mkdir(parents=True,exist_ok=True);os.environ[name]=str(folder)
 os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
 with contextlib.redirect_stdout(sys.stderr):
  import numpy as np, soundfile as sf, torch
  from scipy.signal import resample_poly
  language=resolve_language(request.get('language'));asr_alignment=asr_module();engines=asr_alignment.resolve_engines(request.get('engines'))
  limit=request.get('maxDurationSeconds',DEFAULT_MAX_AUDIO_SECONDS)
  if not isinstance(limit,(int,float)) or not math.isfinite(limit) or limit<=MIN_AUDIO_SECONDS:raise ValueError('가사 정렬 길이 제한이 올바르지 않습니다.')
  audio,rate=sf.read(request['audioPath'],dtype='float32',always_2d=True);audio=audio.mean(axis=1);duration=len(audio)/rate
  if not MIN_AUDIO_SECONDS<=duration<=limit:raise ValueError(f'가사 정렬은 {MIN_AUDIO_SECONDS:g}초 이상 {limit/60:g}분 이하 오디오를 지원합니다.')
  if not np.all(np.isfinite(audio)) or np.max(np.abs(audio))<1e-6:raise ValueError('분석 가능한 오디오가 없습니다.')
  if rate!=16000:factor=math.gcd(rate,16000);audio=resample_poly(audio,16000//factor,rate//factor).astype(np.float32)
  device='cuda' if torch.cuda.is_available() else 'cpu'
  progress('가사 정렬 준비 중',device=device)
  onset_alignment=engine_module('lyric_onset_alignment')
  aligner=functools.partial(primary,language=language['aligner'],folder_name=engines['aligner']['folder'])
  # Recognition runs (or comes from its cache) before the aligner loads, so the two models are
  # never in memory together.
  chunks=asr_alignment.transcribe(audio,root,device,progress,language=language,engines=engines)
  bundle=load_aligner(root,device,engines['aligner']['folder'])
  try:
   lyrics_first=onset_alignment.lyrics_first(audio,lines,window_aligner(audio,aligner,root,device,bundle),normalized,progress)
   _,_,heard,asr=asr_alignment.align(audio,lines,root,device,aligner,normalized,progress,prebuilt_chunks=chunks,language=language,engines=engines,bundle=bundle)
  finally:
   del bundle;gc.collect()
   if device=='cuda':torch.cuda.empty_cache()
  progress('두 정렬 결과를 비교해 시작점을 확정하는 중')
  resolved=onset_alignment.combine(lines,lyrics_first['lines'],heard,lyrics_first['onsets'],duration,asr.get('recognizedWords',[]),normalized)
  preserved={row['lineId']:row for row in request.get('preservedCues',[]) if isinstance(row,dict) and row.get('status') in ('automatic','manual') and isinstance(row.get('start'),(int,float)) and math.isfinite(row['start']) and 0<=row['start']<duration}
  for index,row in enumerate(resolved):
   if row['lineId'] in preserved:
    old=preserved[row['lineId']];resolved[index]={**row,'start':old['start'],'startStatus':'automatic','status':'automatic','startReasons':[],'startMethod':'preserved-'+old['status'],'evidence':{**row.get('evidence',{}),'preservedExistingStart':True}}
  # Review lines between automatic starts are heard again in short clips; the recognizer and the
  # aligner are again loaded one after the other. Lyrics that do not belong to the song are skipped.
  recheck={'runs':0,'clips':0,'moved':0}
  runs=[] if onset_alignment.lyrics_mismatch(heard) else onset_alignment.review_runs(lines,resolved,lyrics_first['onsets'],duration,normalized)
  if runs:
   policy=onset_alignment.RECHECK;times=sorted({time for run in runs for time in run['times']})
   clips=asr_alignment.hear_clips(audio,times,root,device,progress,lead=policy['leadSeconds'],seconds=policy['clipSeconds'],max_new_tokens=policy['maxNewTokens'],batch=policy['batch'],language=language,engines=engines)
   loaded=[]
   def locate(time,word,lead):
    if not loaded:loaded.append(load_aligner(root,device,engines['aligner']['folder']))
    words=onset_alignment.clip_words(clips.get(time,''),normalized);lower=max(0.,time-lead);upper=min(duration,time+policy['clipSeconds'])
    rows=([{'lineId':'heard-before','text':' '.join(words[:word])}] if word else [])+[{'lineId':'heard-opening','text':' '.join(words[word:])}]
    try:row=aligner(audio[int(lower*16000):int(upper*16000)],rows,root,device,loaded[0])[-1]
    except ValueError:return None
    return None if row.get('start') is None else lower+row['start']
   progress('다시 들은 위치로 가사 시작점을 맞추는 중')
   try:resolved,moved=onset_alignment.recheck(lines,resolved,runs,clips,lyrics_first['onsets'],normalized,locate)
   finally:
    loaded.clear();gc.collect()
    if device=='cuda':torch.cuda.empty_cache()
   recheck={'runs':len(runs),'clips':len(times),'moved':moved}
  # Diagnostics for reconcileLyricTiming: lyrics-first ranges vs. ASR-anchored ranges.
  first=[{'lineId':row['lineId'],'start':row.get('coarseStart'),'end':row.get('coarseEnd')} for row in lyrics_first['lines']]
  second=[{'lineId':row['lineId'],'start':row.get('start'),'end':row.get('end')} for row in heard]
  models={name:json.loads((root/engines[name]['folder']/'boks-model-manifest.json').read_text(encoding='utf-8'))['revision'] for name in ('aligner','asr')}
  policy=request.get('onsetPolicy') if isinstance(request.get('onsetPolicy'),str) else 'hybrid-lyrics-first-asr-v1'
  counts={'lyricsFirstConfirmed':sum(row['status']=='automatic' for row in lyrics_first['lines']),'asrAutomatic':sum(row.get('startStatus')=='automatic' for row in heard),'asrLocated':sum(isinstance(row.get('start'),(int,float)) for row in heard),'automatic':sum(row['startStatus']=='automatic' for row in resolved),'recheckMoved':recheck['moved']}
  automation={'version':2,'timingMode':'line-starts','onsetPolicy':policy,'needsConfirmation':[row['lineId'] for row in resolved if row['startStatus']!='automatic']}
  if onset_alignment.lyrics_mismatch(heard):automation.update(lyricsMismatch=True,message='노래에서 들리는 가사가 입력한 가사와 거의 일치하지 않습니다. 이 곡의 가사가 맞는지 먼저 확인해 주세요.')
  result=dict(primary=first,secondary=second,resolved=resolved,asr=asr,lyricsFirst={'onsets':lyrics_first['onsets'],'reference':lyrics_first['reference'],'progressiveLog':lyrics_first['progressiveLog'],'lines':lyrics_first['lines']},asrRows=heard,recheck=recheck,counts=counts,automation=automation,duration=duration,device=device,language=language['code'],models=models,method='hybrid-lyrics-first-asr-cross-check',accuracyGuaranteed=False)
  target=Path(request['outputPath']);target.parent.mkdir(parents=True,exist_ok=True);temp=target.with_suffix('.partial.json');temp.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8');temp.replace(target)
 emit('result',outputPath=str(target.resolve()),**result)
if __name__=='__main__':
 try:main()
 except Exception as error:traceback.print_exc(file=sys.stderr);emit('error',message=str(error));sys.exit(1)
