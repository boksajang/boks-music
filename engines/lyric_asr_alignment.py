"""ASR evidence first; canonical lyrics are never supplied to the recognizer.

One recognizer transcribes every chunk and the forced aligner places recognized words and
canonical lines. This is the independent cross-check of the lyrics-first estimate
(lyric_onset_alignment.combine). Which model folders fill those roles, and the language names
passed to them, come from the request (the Electron engine catalog); the defaults below
reproduce the Korean configuration.
"""
import gc,math,re,json,hashlib,copy

# Every tunable value of the line-start pipeline lives here. They were tuned on real Windows
# runs recorded in docs/LYRIC_ALIGNMENT.md; changing one changes automatic/review decisions,
# so re-run a real-song audit afterwards instead of adjusting values to hide uncertainty.
POLICY={
 # Recognition chunks: 24 s cores plus 4 s context per side (<=32 s per request) so word
 # edges near a core boundary are recognized with context; words are kept by core ownership.
 'chunkCoreSeconds':24,'chunkContextSeconds':4,
 'silentChunkPeak':1e-5,          # digital silence is not sent to a recognizer
 'asrMaxNewTokens':512,           # reaching it means a runaway transcript for one chunk
 # Transcript-to-lyrics match quality (assess_match_evidence).
 'minLineCoverage':.45,           # below this a line is treated as not recognized at all
 'minMatchCoverage':.65,'prefixFraction':.25,'maxPrefixCharacters':4,'minPrefixCoverage':.5,
 'minSpanDensity':.5,'maxWordGapSeconds':4,
 # Forced-aligner onset evidence.
 'minOnsetProbability':.025,      # timestamp-class probability floor for a usable onset
 'cropEdgeSeconds':.08,           # one aligner timestamp step; an onset on the crop edge is not evidence
 'localPadSeconds':.7,'retryPadSeconds':1.5,
 'maxAnchorDistanceSeconds':2,    # aligned onset vs. recognized word onset
 # A first recognized word this far from the rest of its line is not an onset anchor. When the
 # first word abuts the previous recognized word (packed onto the previous phrase's tail), a
 # pause above the lower limit inside the first half of the line's words disqualifies it.
 # Real-song audit: accepted fallbacks had <=0.8 s, packed prefixes 2.0-4.0 s.
 'maxLeadingWordGapSeconds':2,'packedLeadingWordGapSeconds':1,
 # Re-anchoring on the next recognized word: two different window starts before it; the
 # onset must not move with the window (<= one timestamp step) to count as evidence.
 'reanchorPadsSeconds':(1.5,2.5),
 'onsetWindowSeconds':.6,'minOnsetRms':1e-4,
 # Re-anchoring on the word that sounds like the line opening (jamo similarity): the later word
 # must reach this and beat the first word by this margin. One real line (받아도 0.46 vs 받아보다도
 # 0.57 for 「파도보다 더」); validated against all 152 user-confirmed lines of 4 songs.
 'openingSoundsAlike':.5,'openingSoundsBetter':.1,
}
# Language names each engine expects; the Electron catalog sends the active entry.
KOREAN={'code':'ko','asr':'Korean','aligner':'Korean'}
DEFAULT_ENGINES={'aligner':{'folder':'qwen','kind':'qwen3-forced-aligner'},'asr':{'folder':'asr-1.7b','kind':'qwen3-asr'}}
SAMPLE_RATE=16000

def match_characters(expected,recognized):
 """Global edit alignment. Returns exact character matches in occurrence order."""
 import numpy as np
 n,m=len(expected),len(recognized)
 if not n or not m:return []
 if n*m>80_000_000:raise ValueError('가사와 인식문 매칭 범위가 너무 큽니다.')
 previous=-np.arange(m+1,dtype=np.int32);history=np.zeros((n+1,m+1),np.uint8);history[0,1:]=2
 chars=np.array(list(recognized));indices=np.arange(m+1)
 for i,c in enumerate(expected,1):
  diagonal=previous[:-1]+np.where(chars==c,2,-1);deletion=previous[1:]-1
  base=np.concatenate(([-i],np.maximum(diagonal,deletion)));current=np.maximum.accumulate(base+indices)-indices
  history[i,1:]=np.where(current[1:]==diagonal,0,np.where(current[1:]==deletion,1,2));history[i,0]=1;previous=current
 i,j=n,m;pairs=[]
 while i or j:
  move=history[i,j]
  if move==0:
   if expected[i-1]==recognized[j-1]:pairs.append((i-1,j-1))
   i-=1;j-=1
  elif move==1:i-=1
  else:j-=1
 return pairs[::-1]

def unique_words(selected_words):
 unique=[]
 for word in selected_words:
  if not unique or (word['start'],word['end'])!=(unique[-1]['start'],unique[-1]['end']):unique.append(word)
 return unique

def assess_match_evidence(count,relative_positions,recognized_positions,selected_words):
 coverage=len(relative_positions)/max(1,count);prefix=min(POLICY['maxPrefixCharacters'],max(1,math.ceil(count*POLICY['prefixFraction'])))
 prefix_coverage=sum(i<prefix for i in relative_positions)/prefix
 density=len(recognized_positions)/max(1,max(recognized_positions)-min(recognized_positions)+1) if recognized_positions else 0
 unique=unique_words(selected_words)
 gap=max([b['start']-a['end'] for a,b in zip(unique,unique[1:])]+[0]);reasons=[]
 if coverage<POLICY['minMatchCoverage']:reasons.append('partial_asr_match')
 if prefix_coverage<POLICY['minPrefixCoverage']:reasons.append('missing_asr_line_prefix')
 if density<POLICY['minSpanDensity']:reasons.append('scattered_asr_character_match')
 if gap>POLICY['maxWordGapSeconds']:reasons.append('disconnected_asr_word_times')
 if unique and (unique[0].get('startProbability',0)<POLICY['minOnsetProbability'] or 'nonmonotonic_or_invalid_prediction' in unique[0].get('flags',[])):reasons.append('weak_asr_anchor_onset')
 return {'matchCoverage':coverage,'prefixCoverage':prefix_coverage,'recognizedSpanDensity':density,'maximumWordGap':gap,'reasons':reasons}

def reanchor_by_opening(unique,line,normalize,region):
 """A later recognized word of the line (within the next two) that is the line sung from its
 beginning: it sounds clearly more like the line's opening than the first word does, and more like
 the opening than like its own place in the line (a word from the middle, 작은 or 있어, matches its
 own place). region(word) = index of the word's first matched character in the line. Else None."""
 if len(unique)<2 or not line:return None
 from lyric_onset_alignment import sound_similarity
 def alike(word,at=0):text=normalize(word['text']);return sound_similarity(text,line[at:at+len(text)])
 first=alike(unique[0])
 for word in unique[1:3]:
  opening=alike(word)
  if opening>=POLICY['openingSoundsAlike'] and opening-first>=POLICY['openingSoundsBetter'] and opening>alike(word,region(word)):return word
 return None

def leading_word_gap(selected_words):
 """Pause between the first recognized word of a line and the next one (0 when single)."""
 unique=unique_words(selected_words)
 return unique[1]['start']-unique[0]['end'] if len(unique)>1 else 0

def leading_pause(selected_words):
 """First pause longer than the packed limit inside the first half of a line's recognized
 words: (seconds, index of the first word after it), or (0, None)."""
 unique=unique_words(selected_words)
 for index in range(1,len(unique)//2+1):
  gap=unique[index]['start']-unique[index-1]['end']
  if gap>POLICY['packedLeadingWordGapSeconds']:return gap,index
 return 0,None

def reanchor_onset(audio,line,stranded,following,anchor_end,primary,root,device,bundle):
 """Re-align a line whose first recognized word is a squeezed timestamp: windows start after
 that word and before the next recognized word; accept only a window-invariant onset."""
 edge=POLICY['cropEdgeSeconds'];duration=len(audio)/SAMPLE_RATE;candidates=[]
 for pad in POLICY['reanchorPadsSeconds']:
  lower=max(0,stranded['end'],following['start']-pad);upper=min(duration,anchor_end+POLICY['localPadSeconds'])
  if upper-lower<=edge:continue
  local=primary(audio[int(lower*SAMPLE_RATE):int(upper*SAMPLE_RATE)],[line],root,device,bundle)[0];onset=local.get('start')
  candidates.append({'lower':lower,'upper':upper,'local':local,'start':None if onset is None else lower+onset,'probability':local.get('evidence',{}).get('startProbability',0),'cropEdge':onset is not None and onset<=edge and lower>0})
 starts=[row['start'] for row in candidates]
 accepted=len(candidates)==2 and len({row['lower'] for row in candidates})==2 and all(row['start'] is not None and not row['cropEdge'] and row['probability']>=POLICY['minOnsetProbability'] and row['start']<following['start'] for row in candidates) and abs(starts[0]-starts[1])<=edge
 evidence={'anchorWord':following['text'],'anchorStart':following['start'],'strandedWord':stranded['text'],'windows':[[row['lower'],row['upper']] for row in candidates],'starts':starts,'probabilities':[row['probability'] for row in candidates],'accepted':accepted,'independentAgreement':False}
 return (candidates[0] if accepted else None),evidence

def model_dtype(device):
 import torch
 return torch.bfloat16 if device=='cuda' else torch.float32

def release(device):
 gc.collect()
 if device=='cuda':
  import torch
  torch.cuda.empty_cache()

class QwenAsrRecognizer:
 """Qwen3-ASR transcription of one audio chunk (no lyric prompt)."""
 loading='Qwen 음성 인식 모델 로딩 중'
 def __init__(self,folder,device,language,progress):
  from transformers import AutoProcessor,AutoModelForMultimodalLM
  progress(self.loading);self.device=device;self.language=language;self.dtype=model_dtype(device)
  self.processor=AutoProcessor.from_pretrained(folder,local_files_only=True)
  self.model=AutoModelForMultimodalLM.from_pretrained(folder,local_files_only=True,dtype=self.dtype,attn_implementation='sdpa').to(device).eval()
 def transcribe(self,samples):
  import torch
  inputs=self.processor.apply_transcription_request(audio=samples,language=self.language['asr']).to(self.device,self.dtype)
  with torch.inference_mode():generated=self.model.generate(**inputs,max_new_tokens=POLICY['asrMaxNewTokens'],do_sample=False)
  text=self.processor.decode(generated[:,inputs['input_ids'].shape[1]:],return_format='transcription_only')[0]
  return text,generated.shape[1]-inputs['input_ids'].shape[1]>=POLICY['asrMaxNewTokens']
 def transcribe_batch(self,clips,max_new_tokens):
  """Short clips in one padded batch (about 10x faster than one by one on CUDA)."""
  import torch
  inputs=self.processor.apply_transcription_request(audio=list(clips),language=[self.language['asr']]*len(clips)).to(self.device,self.dtype)
  with torch.inference_mode():generated=self.model.generate(**inputs,max_new_tokens=max_new_tokens,do_sample=False)
  return self.processor.decode(generated[:,inputs['input_ids'].shape[1]:],return_format='transcription_only')
 def close(self):
  del self.model,self.processor;release(self.device)

RECOGNIZERS={'qwen3-asr':QwenAsrRecognizer}

def resolve_engines(engines):
 if engines is None:return copy.deepcopy(DEFAULT_ENGINES)
 if not isinstance(engines,dict):raise ValueError('가사 분석 엔진 구성이 올바르지 않습니다.')
 resolved={'aligner':engines.get('aligner'),'asr':engines.get('asr')}
 for role,engine in resolved.items():
  if not isinstance(engine,dict) or not isinstance(engine.get('folder'),str) or not re.fullmatch(r'[A-Za-z0-9._-]+',engine['folder']) or engine['folder'] in ('.','..'):raise ValueError('가사 분석 엔진 폴더가 올바르지 않습니다.')
  if role!='aligner' and engine.get('kind') not in RECOGNIZERS:raise ValueError('지원하지 않는 가사 인식 엔진입니다: '+str(engine.get('kind')))
 return resolved

def chunk_windows(total):
 core=POLICY['chunkCoreSeconds']*SAMPLE_RATE;context=POLICY['chunkContextSeconds']*SAMPLE_RATE
 for start in range(0,total,core):yield start,max(0,start-context),min(total,start+core+context)

def recognize_chunks(audio,recognizer,progress):
 import numpy as np
 duration=len(audio)/SAMPLE_RATE;chunks=[]
 for core,left,right in chunk_windows(len(audio)):
  chunk=audio[left:right]
  progress('보컬에서 실제 가사를 인식 중',processedSeconds=core/SAMPLE_RATE,totalSeconds=duration)
  if float(np.max(np.abs(chunk)))<POLICY['silentChunkPeak']:continue
  text,truncated=recognizer.transcribe(chunk)
  row={'left':left/SAMPLE_RATE,'right':right/SAMPLE_RATE,'coreStart':core/SAMPLE_RATE,'coreEnd':min(duration,core/SAMPLE_RATE+POLICY['chunkCoreSeconds']),'text':text}
  # A runaway transcript is not evidence; its lines stay unresolved for review.
  if truncated:row.update(text='',truncated=True);progress('음성 인식 결과가 길이 한도에 도달한 구간은 가사 기준 정렬 결과로 판단합니다',processedSeconds=core/SAMPLE_RATE,totalSeconds=duration)
  chunks.append(row)
 return chunks

def transcribe(audio,root,device,progress,*,language=None,engines=None,recognizers=None):
 """Recognition chunks for the whole audio, from the cache (audio PCM, model revision, chunk
 policy and language) or by loading, running and closing the recognizer."""
 language=language or KOREAN;engines=resolve_engines(engines);recognizers=recognizers or RECOGNIZERS
 duration=len(audio)/SAMPLE_RATE;folder=root/engines['asr']['folder']
 revision=json.loads((folder/'boks-model-manifest.json').read_text(encoding='utf8'))['revision']
 policy_tag=f"{POLICY['chunkCoreSeconds']}core-{POLICY['chunkContextSeconds']}context-{language['asr'].lower()}-v1".encode()
 key=hashlib.sha256(audio.tobytes()+revision.encode()+policy_tag).hexdigest();cache=root/'cache'/'asr';cache.mkdir(parents=True,exist_ok=True);cache_file=cache/(key+'.json')
 if cache_file.exists():
  try:
   cached=json.loads(cache_file.read_text(encoding='utf8'));candidate=cached['chunks']
   if cached.get('revision')==revision and isinstance(candidate,list) and all(isinstance(row,dict) and isinstance(row.get('text'),str) and all(isinstance(row.get(key),(int,float)) and math.isfinite(row[key]) for key in ['left','right','coreStart','coreEnd']) and 0<=row['left']<=row['coreStart']<row['coreEnd']<=row['right']<=duration for row in candidate):
    progress('저장된 음성 인식 결과를 재사용 중');return candidate
  except (ValueError,KeyError,TypeError,OSError):pass
 recognizer=recognizers[engines['asr']['kind']](folder,device,language,progress)
 try:chunks=recognize_chunks(audio,recognizer,progress)
 finally:recognizer.close()
 temp=cache_file.with_suffix('.partial.json');temp.write_text(json.dumps({'revision':revision,'chunks':chunks},ensure_ascii=False),encoding='utf8');temp.replace(cache_file)
 return chunks

def hear_clips(audio,times,root,device,progress,*,lead,seconds,max_new_tokens,batch,language=None,engines=None,recognizers=None):
 """{time: text} for the clip [time-lead, time+seconds] at each time (the recognizer is loaded
 here and closed afterwards)."""
 language=language or KOREAN;engines=resolve_engines(engines);recognizers=recognizers or RECOGNIZERS
 times=list(times);heard={}
 if not times:return heard
 recognizer=recognizers[engines['asr']['kind']](root/engines['asr']['folder'],device,language,progress)
 try:
  for offset in range(0,len(times),batch):
   group=times[offset:offset+batch];clips=[audio[max(0,int((t-lead)*SAMPLE_RATE)):min(len(audio),int((t+seconds)*SAMPLE_RATE))] for t in group]
   progress('확인이 필요한 가사 줄을 짧게 다시 듣는 중',processedClips=offset,totalClips=len(times))
   texts=recognizer.transcribe_batch(clips,max_new_tokens) if hasattr(recognizer,'transcribe_batch') else [recognizer.transcribe(clip)[0] for clip in clips]
   heard.update(zip(group,texts))
 finally:recognizer.close()
 return heard

def align(audio,lines,root,device,primary,normalize,progress,prebuilt_chunks=None,*,language=None,engines=None,recognizers=None,bundle=None):
 """prebuilt_chunks: recognition chunks from transcribe(); transcribed here when omitted.
 bundle: an already loaded (processor, model) forced aligner shared with the caller; it is
 left loaded. Without it the aligner is loaded here and released afterwards."""
 import numpy as np
 from transformers import AutoProcessor,AutoModelForTokenClassification
 language=language or KOREAN;engines=resolve_engines(engines)
 duration=len(audio)/SAMPLE_RATE;dtype=model_dtype(device)
 chunks=prebuilt_chunks if prebuilt_chunks is not None else transcribe(audio,root,device,progress,language=language,engines=engines,recognizers=recognizers)
 owned=bundle is None
 if owned:
  aligner=root/engines['aligner']['folder']
  processor=AutoProcessor.from_pretrained(aligner,local_files_only=True)
  model=AutoModelForTokenClassification.from_pretrained(aligner,local_files_only=True,dtype=dtype,attn_implementation='sdpa').to(device).eval();bundle=(processor,model)
 seconds=lambda value:int(value*SAMPLE_RATE)
 words=[]
 for chunk in chunks:
  tokens=[word for word in re.split(r'\s+',chunk['text'].strip()) if normalize(word)]
  if not tokens:continue
  progress('인식된 단어의 음향 위치를 찾는 중',processedSeconds=chunk['coreStart'],totalSeconds=duration)
  rows=primary(audio[seconds(chunk['left']):seconds(chunk['right'])],[{'lineId':str(i),'text':word} for i,word in enumerate(tokens)],root,device,bundle)
  for word,row in zip(tokens,rows):
   if row.get('start') is None:continue
   start=row['start']+chunk['left'];end=row['end']+chunk['left'];center=(start+end)/2
   if chunk['coreStart']<=center<chunk['coreEnd']:words.append({'text':word,'start':start,'end':end,'score':row.get('score',0),'startProbability':row.get('evidence',{}).get('startProbability',0),'flags':row.get('flags',[])})
 words.sort(key=lambda word:(word['start'],word['end']))
 expected=''.join(normalize(line['text']) for line in lines);recognized='';owners=[];word_character_starts=[]
 for i,word in enumerate(words):
  word_character_starts.append(len(recognized))
  chars=normalize(word['text']);recognized+=chars;owners.extend([i]*len(chars))
 matched=dict(match_characters(expected,recognized));resolved=[];first=[];second=[];cursor=0;previous=-1
 # Recognized words with no character in the lyrics: ad-libs (woo, hey), repeated lines, misheard words.
 heard={owners[position] for position in matched.values()}
 for index,word in enumerate(words):word['matched']=index in heard
 floor=POLICY['minOnsetProbability'];edge=POLICY['cropEdgeSeconds']
 for line in lines:
  count=len(normalize(line['text']));relative=[i-cursor for i in range(cursor,cursor+count) if i in matched];positions=[matched[i] for i in range(cursor,cursor+count) if i in matched];cursor+=count;coverage=len(positions)/max(1,count)
  evidence={'asrCoverage':coverage,'asrMatchedCharacters':len(positions),'canonicalCharacters':count,'independentAgreement':False,'source':'asr-transcript-global-monotonic-match+local-forced-aligner'}
  selected=[words[owners[pos]] for pos in positions]
  quality=assess_match_evidence(count,relative,positions,selected);evidence['matchQuality']=quality
  if not selected or coverage<POLICY['minLineCoverage']:
   row={'lineId':line['lineId'],'start':None,'end':None,'status':'review','startStatus':'review','startReasons':['insufficient_asr_lyrics_match'],'method':'asr-unmatched','evidence':evidence};resolved.append(row);first.append(dict(lineId=line['lineId'],start=None,end=None,flags=['asr_unmatched']));second.append(dict(lineId=line['lineId'],start=None,end=None,score=coverage));continue
  anchor_start=min(word['start'] for word in selected);anchor_end=max(word['end'] for word in selected)
  # The line starts at the recognized word that sounds like its opening. A first word that only
  # shares a character with the line (받아도 for 파도보다: '도') gives way to a later one that sounds
  # clearly more like the opening (받아보다도), compared by Hangul jamo.
  region={}
  for place,position in zip(relative,positions):
   word=words[owners[position]];region[id(word)]=min(region.get(id(word),place),place)
  opening_word=reanchor_by_opening(unique_words(selected),normalize(line['text']),normalize,lambda word:region.get(id(word),0))
  if opening_word is not None:evidence['openingReanchored']={'from':anchor_start,'to':opening_word['start'],'word':opening_word['text']};anchor_start=opening_word['start']
  lower=max(0,anchor_start-POLICY['localPadSeconds']);upper=min(duration,anchor_end+POLICY['localPadSeconds'])
  progress('원문 가사를 인식 구간에 정렬 중',lineId=line['lineId'])
  local=primary(audio[seconds(lower):seconds(upper)],[line],root,device,bundle)[0]
  local_start=local.get('start');local_probability=local.get('evidence',{}).get('startProbability',0)
  if local_start is None or local_probability<floor or (local_start<=edge and lower>0):
   retry_lower=max(0,anchor_start-POLICY['retryPadSeconds']);retry_upper=min(duration,anchor_end+POLICY['retryPadSeconds'])
   progress('불확실한 가사 시작을 넓은 구간에서 재분석 중',lineId=line['lineId'])
   retried=primary(audio[seconds(retry_lower):seconds(retry_upper)],[line],root,device,bundle)[0]
   rs=retried.get('start');rp=retried.get('evidence',{}).get('startProbability',0)
   accepted=isinstance(rs,(int,float)) and (rs>edge or retry_lower==0) and abs(rs+retry_lower-anchor_start)<=POLICY['maxAnchorDistanceSeconds'] and rp>=max(floor,local_probability)
   evidence['localRetry']={'window':[retry_lower,retry_upper],'start':rs+retry_lower if isinstance(rs,(int,float)) else None,'onsetProbability':rp,'accepted':accepted,'independentAgreement':False}
   if accepted:local=retried;lower=retry_lower;upper=retry_upper
  start=local.get('start');end=local.get('end');reasons=list(quality['reasons'])
  if start is not None:start+=lower;end+=lower
  anchor_word=next((word for word in selected if word['start']==anchor_start),min(selected,key=lambda word:word['start']));anchor_probability=anchor_word.get('startProbability',0)
  crop_prediction=start is not None and start-lower<=edge and lower>0
  exact_word_prefix=bool(relative and relative[0]==0 and positions[0]==word_character_starts[owners[positions[0]]])
  # The recognized first word replaces a crop-edge onset only when it belongs to the sung
  # phrase: a first word separated from the rest of its line by a long pause is usually a
  # squeezed timestamp at the tail of the previous phrase.
  lead_gap=leading_word_gap(selected);onset_anchor=anchor_start
  if crop_prediction and not quality['reasons'] and exact_word_prefix and anchor_probability>=floor and anchor_start>previous:
   unique=unique_words(selected);index=next(i for i,word in enumerate(words) if word is unique[0])
   # Packed: the word aligner put the line's first word(s) onto the previous phrase's tail,
   # followed by a pause before the rest of the line.
   pause,after=leading_pause(selected)
   packed=index>0 and words[index-1]['end']>=unique[0]['start']-edge and after is not None
   if lead_gap>POLICY['maxLeadingWordGapSeconds'] or packed:
    evidence['asrWordOnsetFallbackRejected']={'leadingWordGap':lead_gap,'word':anchor_word['text'],'packedOntoPreviousWord':packed,'packedPause':pause}
    # Re-analyse only packed words; an isolated early word stays for review.
    if packed:
     progress('떨어진 첫 단어 대신 다음 단어 기준으로 가사 시작을 재분석 중',lineId=line['lineId'])
     chosen,evidence['reanchoredOnset']=reanchor_onset(audio,line,unique[after-1],unique[after],anchor_end,primary,root,device,bundle)
     if chosen:local=chosen['local'];lower=chosen['lower'];upper=chosen['upper'];start=chosen['start'];end=lower+local['end'] if isinstance(local.get('end'),(int,float)) else None;onset_anchor=unique[after]['start']
   else:
    samples=audio[seconds(anchor_start):min(len(audio),seconds(anchor_start+POLICY['onsetWindowSeconds']))]
    anchor_activity=float(np.sqrt(np.mean(samples**2))) if len(samples) else 0
    if anchor_activity>=POLICY['minOnsetRms']:
     evidence['asrWordOnsetFallback']={'discardedCropStart':start,'exactOriginalAndWordPrefix':exact_word_prefix,'word':anchor_word['text'],'startProbability':anchor_probability,'activityRms':anchor_activity,'leadingWordGap':lead_gap,'independentAgreement':False};start=anchor_start
  valid=isinstance(start,(int,float)) and 0<=start<duration
  if not valid:reasons.append('invalid_local_onset')
  elif start<=previous:reasons.append('nonincreasing_start')
  if valid and abs(start-onset_anchor)>POLICY['maxAnchorDistanceSeconds']:reasons.append('local_onset_far_from_asr_anchor')
  probability=local.get('evidence',{}).get('startProbability',0)
  if probability<floor and 'asrWordOnsetFallback' not in evidence:reasons.append('low_local_onset_probability')
  if valid:
   window=range(seconds(start),min(len(audio),seconds(start+POLICY['onsetWindowSeconds'])),320)
   energy=np.array([np.sqrt(np.mean(audio[j:j+320]**2)) for j in window])
   if not len(energy) or float(np.max(energy))<POLICY['minOnsetRms']:reasons.append('no_onset_vocal_activity')
   if start-lower<=edge and lower>0 and 'asrWordOnsetFallback' not in evidence:reasons.append('local_crop_boundary_prediction')
   previous=max(previous,start)
  evidence.update(asrAnchorStart=anchor_start,asrAnchorEnd=anchor_end,localWindow=[lower,upper],localStartProbability=probability)
  method='asr-word-onset-fallback' if 'asrWordOnsetFallback' in evidence else 'asr-reanchored-local-alignment' if evidence.get('reanchoredOnset',{}).get('accepted') else 'asr-anchored-local-alignment'
  row={'lineId':line['lineId'],'start':start,'end':end,'status':'review' if reasons else 'automatic','startStatus':'review' if reasons else 'automatic','startReasons':reasons,'method':method,'startMethod':method,'evidence':evidence};resolved.append(row)
  first.append({**local,'start':start,'end':end});second.append({'lineId':line['lineId'],'start':anchor_start,'end':anchor_end,'score':coverage,'method':'asr-character-match'})
 if owned:del model,processor,bundle;release(device)
 return first,second,resolved,{'chunks':chunks,'recognizedWords':words}
