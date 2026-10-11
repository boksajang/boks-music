"""Lyrics-first line starts and the hybrid decision with the ASR-anchored pipeline.

The known lyric text is force-aligned progressively (no recognizer in the loop), every line is
re-aligned in two different local windows, and the start is snapped to a vocal energy onset.
That estimate is cross-checked with the independent ASR-anchored estimate
(lyric_asr_alignment.align on the whole song): a line is automatic only when both agree, or when
the lyrics-first start is strictly confirmed and not contradicted. Everything else is shown for
review with the better-supported candidate.

Measured on 6 real songs / 233 lines (docs/LYRIC_ALIGNMENT.md): ASR-only 206 automatic with 27
automatic starts disputed by the other method by more than 0.5 s; the hybrid 171 automatic with
2 disputed, about 17 % less time. The product additionally requires the recognizer to have heard
every automatic line (167 automatic on the same songs). Changing a value changes automatic/review decisions, so re-run
the real-song comparison afterwards instead of tuning values to hide uncertainty.
"""
import numpy as np

SAMPLE_RATE=16000
POLICY={
 # A. Vocal onsets: RMS envelope (25 ms window, 10 ms hop, dB). Thresholds follow the LOCAL
 # sung level (max of the next 0.3 s) because stem reverb tails rarely fall below a global
 # threshold. An onset is an upward crossing of (local peak - 15 dB) preceded by a low region
 # (<= local peak - 20 dB): 'strong' after >= 0.15 s (silence/breath), otherwise 'weak' when a
 # >= 10 dB dip precedes it (legato transition).
 'hop':.01,'win':.025,'refPercentile':95,
 'localPeakAhead':.3,'riseBelowPeakDb':15,'lowBelowPeakDb':20,'minLocalPeakBelowRefDb':25,
 'strongGapSeconds':.15,'weakDipDb':10,'lowSearchSeconds':.6,'lowRunSlack':.15,'minOnsetFrames':10,
 # B. Coarse: progressive forced alignment of the known text. A 30 s window (widened to 45/60 s
 # when nothing is accepted) starts at the last accepted line, which is re-aligned as context;
 # the window gets more text than fits (6 chars/s). Lines are accepted in order until one ends
 # near the window end, is compressed, has low onset probability, has no vocal energy, or is the
 # last text line of the window.
 'progressiveWidths':(30,45,60),'overfillCharsPerSecond':6,'windowEndGuard':3.,
 'minSecondsPerChar':.08,'contextLead':.3,'activityBelowRefDb':30,'activityFrames':40,
 'firstOnsetLead':1.,'minCoarseSpacing':.2,
 # C. Fine: two local windows with the previous line as context (or the line alone after a
 # long gap); first-word start snapped to the nearest onset (strong 0.25 s, weak 0.12 s).
 'w1PadBefore':.6,'w1PadAfter':.8,'w2PadBefore':1.6,'w2PadAfter':1.6,
 'maxContextGapSeconds':4.,'soloLeadSeconds':1.5,'fallbackLineSeconds':4.,
 'cropEdgeSeconds':.08,'minOnsetProbability':.025,
 # D. Strict confirmation: both fine windows usable and within 0.2 s, fine within 1.0 s of
 # coarse, a STRONG onset within 0.25 s and an increasing start. Weak onsets occur about once
 # per syllable (~24 % chance agreement on a real stem), so they refine but never confirm.
 'windowAgreement':.2,'coarseAgreement':1.,'strongSnap':.25,'weakSnap':.12,'minLineSpacing':.2,
}
HYBRID={
 # Lyric videos tolerate a few tenths of a second. On the user's 4 reviewed songs every review
 # line was saved about 1 s after a candidate that already sat on the vocal onset (reaction time
 # while listening), so 0.2 s sent correct lines to review (2026-10-11, docs/LYRIC_ALIGNMENT.md).
 'agreeSeconds':.5,          # both methods within this -> automatic
 # Within this, one candidate decides when it alone is confirmed by its own method AND sits on a
 # strong vocal onset (lyrics-first: strict; ASR-anchored: automatic with an onset within 0.1 s).
 'onsetBackedSeconds':1.,'onsetMatchSeconds':.1,
 'onsetSupportSeconds':.25,  # review candidate support: strong onset this close
 # A lyrics-first start on a recognized word that has no character in the lyrics and does not
 # sound like the line's opening is an ad-lib (woo, hey on real songs): never automatic, and the
 # ASR-anchored candidate is shown. A misheard opening word (폭죽 -> 포죽, 낙엽 -> 나겹) is also
 # unmatched but sounds alike: compared by Hangul jamo.
 'adlibLeadSeconds':.15,'misheardSimilarity':.4,
 # ...only when the ASR-anchored start lies at least this much later.
 'adlibAsrLaterSeconds':.3,
 # A line sung twice: both candidates read as this line (character similarity) and lie between
 # the neighbouring lines (a chorus line also appears in the other chorus) -> first occurrence.
 'repeatSimilarity':.6,'repeatMinGapSeconds':1.,
 # Share of lines the recognizer located. Real songs 0.85-1.00, another song's lyrics 0.00;
 # below this the user is asked to check that the lyrics belong to the song.
 'minHeardLineShare':.5,
}
RECHECK={
 # Review lines between automatic starts are heard again: the recognizer transcribes a short clip
 # at every vocal onset (and candidate) of the gap, and a clip whose words read like the line's
 # opening (jamo similarity) locates it. Both whole-song methods share one forced aligner, which
 # squeezes words around long sung notes and instrumental breaks (dance song: 0.08 s words, then
 # one word stretched over 2-3 s), while a 3 s clip is recognized reliably. 2026-10-11, 40 review
 # lines of 6 songs against the user's starts: correct candidates 28 -> 35, none broken.
 'clipSeconds':3.,'leadSeconds':.15,'maxNewTokens':64,'batch':16,
 'openingSimilarity':.5,      # a clip reads as the opening; also the gain of keeping the candidate
 'candidateBonus':.1,         # ties keep the current candidate
 'minOpeningCharacters':3,
 # The recognizer drops the previous phrase's partial tail at a clip start, so clips before the
 # line also read as its opening: the latest clip of that contiguous run is the start, unless a
 # later clip hears less of the line (it lost the beginning; repeated openings like 두근두근 두근두근).
 'chainDrop':.15,
 # Otherwise the opening word is timed by the forced aligner on the clip at two lead-ins and is
 # used only when both agree and neither sits on the clip edge (the aligner follows the edge when
 # it cannot place the word).
 'alignLeads':(.6,1.2),'alignAgreement':.3,'cropEdgeSeconds':.1,
}

def jamo(text):
 """Hangul syllables split into lead/vowel/tail jamo, other characters lower-cased."""
 out=[]
 for char in text:
  code=ord(char)-0xAC00
  if 0<=code<11172:
   out+=[chr(0x1100+code//588),chr(0x1161+code%588//28)]
   if code%28:out.append(chr(0x11A7+code%28))
  else:out.append(char.lower())
 return ''.join(out)

def sound_similarity(a,b):
 from difflib import SequenceMatcher
 a,b=jamo(a),jamo(b)
 return SequenceMatcher(None,a,b).ratio() if a and b else 0.

def sounds_alike(a,b):
 return sound_similarity(a,b)>=HYBRID['misheardSimilarity']


def lyrics_mismatch(asr_rows):
 heard=sum(isinstance(row.get('start'),(int,float)) for row in asr_rows)
 return bool(asr_rows) and heard/len(asr_rows)<HYBRID['minHeardLineShare']

def envelope(audio):
 hop=int(POLICY['hop']*SAMPLE_RATE);win=int(POLICY['win']*SAMPLE_RATE)
 padded=np.pad(audio,(win//2,win//2));count=1+(len(padded)-win)//hop
 if count<1:return np.full(1,-140.)
 index=np.arange(win)[None,:]+hop*np.arange(count)[:,None]
 rms=np.sqrt(np.mean(padded[index]**2,axis=1))
 # 3-frame median then 3-frame mean. Edges repeat the first/last frame: zero padding read as
 # 0 dB and produced a false strong onset on the last frame of a quiet ending.
 three=lambda values:np.pad(values,1,mode='edge');db=three(20*np.log10(rms+1e-7))
 db=three(np.median(np.stack([db[:-2],db[1:-1],db[2:]]),axis=0))
 return (db[:-2]+db[1:-1]+db[2:])/3

def detect_onsets(db):
 from numpy.lib.stride_tricks import sliding_window_view
 hop=POLICY['hop'];voiced=db[db>-75]
 reference=float(np.percentile(voiced,POLICY['refPercentile'])) if len(voiced) else float(db.max())
 ahead=int(POLICY['localPeakAhead']/hop)
 peak=sliding_window_view(np.pad(db,(0,ahead),mode='edge'),ahead+1).max(axis=1)
 onsets=[];last=-10**9;search=int(POLICY['lowSearchSeconds']/hop);slack=int(POLICY['lowRunSlack']/hop)
 for t in range(1,len(db)):
  local=peak[t]
  if local<reference-POLICY['minLocalPeakBelowRefDb']:continue
  level=local-POLICY['riseBelowPeakDb']
  if not db[t-1]<level<=db[t] or t-last<POLICY['minOnsetFrames']:continue
  low=local-POLICY['lowBelowPeakDb'];lo=max(0,t-search);below=db[lo:t]<=low
  # A contiguous low run must end within `slack` frames before the crossing.
  end=next((k for k in range(t-1,max(lo,t-1-slack)-1,-1) if below[k-lo]),None)
  dip=float(local-db[lo:t].min())
  if end is None:
   if dip>=POLICY['weakDipDb']:onsets.append({'time':round(t*hop,3),'kind':'weak','dipDb':round(dip,1),'gap':0.});last=t
   continue
  k=end
  while k>lo and below[k-1-lo]:k-=1
  run=POLICY['lowSearchSeconds'] if k==lo and lo>0 else (end-k+1)*hop
  kind='strong' if run>=POLICY['strongGapSeconds'] else 'weak'
  # A strong onset is the first frame after the low region (consonant energy), not the vowel crossing.
  onsets.append({'time':round((end+1 if kind=='strong' else t)*hop,3),'crossing':round(t*hop,3),'kind':kind,'gap':round(run,3),'dipDb':round(dip,1)});last=t
 return reference,onsets

def nearest(onsets,time,tolerance,kind):
 best=None
 for item in onsets:
  if item['kind']==kind and abs(item['time']-time)<=tolerance and (best is None or abs(item['time']-time)<abs(best['time']-time)):best=item
 return best

def lyrics_first(audio,lines,align_window,normalize,progress):
 """align_window(lower, upper, rows) -> (lower, upper, aligner rows relative to lower)."""
 duration=len(audio)/SAMPLE_RATE;count=len(lines);chars=[len(normalize(line['text'])) for line in lines]
 progress('가사 기준 정렬: 보컬 발성 시작점을 찾는 중')
 db=envelope(audio);reference,onsets=detect_onsets(db)
 def active(start):
  index=int(start/POLICY['hop']);segment=db[index:index+POLICY['activityFrames']]
  return len(segment)>0 and float(segment.max())>=reference-POLICY['activityBelowRefDb']
 strong=[item['time'] for item in onsets if item['kind']=='strong']
 coarse=[None]*count;log=[];k=0;context=None;cursor=max(0.,(strong[0] if strong else 0.)-POLICY['firstOnsetLead'])
 while k<count:
  accepted=[]
  for width in POLICY['progressiveWidths']:
   lower=cursor;upper=min(duration,lower+width);reaches_end=upper>=duration-.01
   selected=[] if context is None else [context];budget=0
   for j in range(k,count):
    selected.append(j);budget+=chars[j]
    if budget>=width*POLICY['overfillCharsPerSecond']:break
   progress('가사 기준 정렬: 가사 줄 위치를 찾는 중',processedSeconds=lower,totalSeconds=duration)
   lower,upper,rows=align_window(lower,upper,[lines[j] for j in selected])
   accepted=[];stop=None;previous_start=coarse[context]['start'] if context is not None else -1
   for index,j in enumerate(selected):
    if j<k:continue
    row=rows[index]
    if row.get('start') is None or row.get('end') is None:stop='invalid';break
    start=lower+row['start'];end=lower+row['end'];probability=row.get('evidence',{}).get('startProbability',0)
    if probability<POLICY['minOnsetProbability']:stop='low_probability';break
    if not reaches_end and end>upper-POLICY['windowEndGuard']:stop='near_window_end';break
    if end-start<POLICY['minSecondsPerChar']*chars[j]:stop='compressed';break
    if index==len(selected)-1 and not (reaches_end and j==count-1):stop='last_text_line';break
    if start<=previous_start+POLICY['minCoarseSpacing']:stop='nonincreasing';break
    if not active(start):stop='no_vocal_energy';break
    coarse[j]={'start':round(start,3),'end':round(end,3),'probability':probability,'window':[round(lower,3),round(upper,3)]};previous_start=start;accepted.append(j)
   log.append({'window':[round(lower,2),round(upper,2)],'lines':[selected[0],selected[-1]],'accepted':accepted,'stop':stop})
   if accepted:break
  if not accepted:
   # Keep order: place line k from the widest window without the acceptance checks, marked
   # unconfirmed (always review). Skipping it let a later repeated chorus line lock onto this
   # region on a real song.
   index=selected.index(k) if k in selected else None;row=rows[index] if index is not None else {}
   previous_start=coarse[context]['start'] if context is not None else -1
   if row.get('start') is not None and row.get('end') is not None and lower+row['start']>previous_start+POLICY['minCoarseSpacing']:
    coarse[k]={'start':round(lower+row['start'],3),'end':round(lower+row['end'],3),'probability':row.get('evidence',{}).get('startProbability',0),'window':[round(lower,3),round(upper,3)],'unconfirmed':True}
    context=k;cursor=max(lower,coarse[k]['start']-POLICY['contextLead'])
   k+=1;continue
  k=accepted[-1]+1;context=accepted[-1];cursor=max(lower,coarse[context]['start']-POLICY['contextLead'])
 results=[];previous_final=-1.
 for i,line in enumerate(lines):
  c=coarse[i];row={'lineId':line['lineId'],'coarseStart':c and c['start'],'coarseEnd':c and c['end']}
  if c is None:row.update(start=None,status='review',reasons=['no_coarse_position']);results.append(row);continue
  progress('가사 기준 정렬: 줄 시작을 정밀하게 맞추는 중',lineId=line['lineId'],processedSeconds=c['start'],totalSeconds=duration)
  anchor=c['start'];end_guess=c['end'] if c['end']>anchor else anchor+POLICY['fallbackLineSeconds'];prev=coarse[i-1] if i else None
  use_context=prev is not None and anchor-prev['end']<=POLICY['maxContextGapSeconds'];fine=[]
  for name,before,after in (('W1',POLICY['w1PadBefore'],POLICY['w1PadAfter']),('W2',POLICY['w2PadBefore'],POLICY['w2PadAfter'])):
   if use_context:lower,upper,out=align_window(prev['start']-before,end_guess+after,[lines[i-1],line]);aligned=out[1]
   else:
    floor=prev['end'] if prev is not None else 0.
    lower,upper,out=align_window(max(floor,anchor-before-(POLICY['soloLeadSeconds'] if name=='W2' else 0)),end_guess+after,[line]);aligned=out[0]
   start=aligned.get('start')
   fine.append({'name':name,'window':[round(lower,3),round(upper,3)],'context':use_context,'start':None if start is None else round(lower+start,3),'probability':aligned.get('evidence',{}).get('startProbability',0),'cropEdge':start is not None and start<=POLICY['cropEdgeSeconds'] and lower>0 and not use_context})
  row['fine']=fine;reasons=[]
  usable=[f for f in fine if f['start'] is not None and not f['cropEdge'] and f['probability']>=POLICY['minOnsetProbability']]
  if len(usable)<2:reasons.append('fine_window_unusable')
  first=next((f['start'] for f in fine if f['start'] is not None),None)
  if first is None:row.update(start=anchor,status='review',reasons=reasons+['no_fine_start']);results.append(row);continue
  if len(usable)==2 and abs(usable[0]['start']-usable[1]['start'])>POLICY['windowAgreement']:reasons.append('fine_windows_disagree')
  if abs(first-anchor)>POLICY['coarseAgreement']:reasons.append('fine_far_from_coarse')
  if c.get('unconfirmed'):reasons.append('coarse_unconfirmed')
  snapped=nearest(onsets,first,POLICY['strongSnap'],'strong') or nearest(onsets,first,POLICY['weakSnap'],'weak')
  final=snapped['time'] if snapped else first
  if not snapped:reasons.append('no_energy_onset_near_fine_start')
  if final<=previous_final+POLICY['minLineSpacing']:reasons.append('nonincreasing_start')
  if snapped and snapped['kind']=='weak':reasons.append('only_weak_onset')
  row.update(fineStart=first,onset=snapped,start=round(final,3),status='review' if reasons else 'automatic',reasons=reasons)
  previous_final=max(previous_final,final);results.append(row)
 return {'lines':results,'onsets':onsets,'reference':reference,'progressiveLog':log}

def heard_after(words,time,normalize,size):
 """About one line of characters the recognizer heard from `time` on, and the word indices used."""
 text='';used=[]
 for index,word in enumerate(words):
  if word['start']<time-.25:continue
  text+=normalize(word['text']);used.append(index)
  if len(text)>=size:break
 return text,set(used)

def combine(lines,first,asr_rows,onsets,duration,words=(),normalize=None,song_heard=None):
 """Hybrid decision. first = lyrics_first() lines, asr_rows = align() resolved rows (same order),
 words = recognized words (with `matched`: has a character in the lyrics), song_heard = the
 recognizer located most lines (not lyrics_mismatch)."""
 if song_heard is None:song_heard=not lyrics_mismatch(asr_rows)
 from difflib import SequenceMatcher
 strong=[item['time'] for item in onsets if item['kind']=='strong']
 near_strong=lambda time,tolerance:time is not None and any(abs(onset-time)<=tolerance for onset in strong)
 supported=lambda time:near_strong(time,HYBRID['onsetSupportSeconds'])
 valid=lambda time:isinstance(time,(int,float)) and 0<=time<duration
 words=sorted((word for word in words or () if isinstance(word.get('start'),(int,float)) and isinstance(word.get('end'),(int,float))),key=lambda word:word['start'])
 def adlib_at(time,line):
  # The recognized word under `time` has no lyric character, does not sound like the line's
  # opening (a misheard first word does), and no lyric word starts right after.
  if time is None or not normalize:return False
  under=[word for word in words if word['start']-HYBRID['adlibLeadSeconds']<=time<=word['end']]
  if not under or any(word.get('matched',True) for word in under):return False
  following=next((word for word in words if word['start']>=time and word.get('matched',True)),None)
  if following is not None and following['start']-time<=.3:return False
  # Everything heard from here up to the next lyric word, against the line's opening of the
  # same length: a misheard opening is often split differently (폭죽 터질 -> 목 쭈떡할).
  first=words.index(under[0]);heard=''
  for word in words[first:]:
   if word.get('matched',True):break
   heard+=normalize(word['text'])
  return not sounds_alike(heard,normalize(line.get('text',''))[:len(heard)])
 def sung_twice(line,a,b):
  # Both candidates read as this line from their own, separate words (two candidates inside
  # one sung line share words and are not a repetition).
  if not normalize or not words:return False
  expected=normalize(line['text'])
  if not expected:return False
  # The two takes sound alike (they may be misheard the same way) and one reads as the line.
  (text_a,used_a),(text_b,used_b)=heard_after(words,a,normalize,len(expected)),heard_after(words,b,normalize,len(expected))
  similar=lambda x,y:SequenceMatcher(None,x,y).ratio()>=HYBRID['repeatSimilarity']
  return not used_a&used_b and similar(text_a,text_b) and (similar(expected,text_a) or similar(expected,text_b))
 candidates=[[value for value in (lyric.get('start'),heard.get('start')) if valid(value)] for lyric,heard in zip(first,asr_rows)]
 out=[]
 for index,(line,lyric,heard) in enumerate(zip(lines,first,asr_rows)):
  new=lyric['start'] if valid(lyric.get('start')) else None;strict=new is not None and lyric['status']=='automatic'
  old=heard.get('start') if valid(heard.get('start')) else None;old_auto=old is not None and heard.get('startStatus')=='automatic'
  # Millisecond rounding keeps the boundary deterministic (0.5 s apart agrees, not float noise).
  difference=round(abs(new-old),3) if new is not None and old is not None else None
  previous=next((row['start'] for row in reversed(out) if row['start'] is not None),-1)
  following=min((value for row in candidates[index+1:index+2] for value in row),default=duration)
  # A line sung twice in a row is decided first: its first take may be misheard (no lyric
  # character), which would otherwise read as an ad-lib.
  repeated=(difference is not None and difference>=HYBRID['repeatMinGapSeconds']
   and previous<min(new,old) and max(new,old)<following and sung_twice(line,new,old))
  adlib=not repeated and adlib_at(new,line) and old is not None and old-new>=HYBRID['adlibAsrLaterSeconds']
  # Every automatic start needs the recognizer to have heard this line nearby: the aligner also
  # places wrong lyrics confidently (another song's lyrics got 7 strict starts in a real test).
  # Better-supported candidate: an ad-lib start gives way to the ASR-anchored one; otherwise own
  # confirmation counts double, a strong onset nearby once; tie -> lyrics-first.
  score_new=(2*strict+supported(new)) if new is not None and not adlib else -1;score_old=(2*old_auto+supported(old)) if old is not None else -1
  chosen=(old,'asr') if score_old>score_new or (adlib and old is not None) else (new,'lyrics-first')
  automatic,why,start,source=False,None,None,None
  if repeated:
   # The line is sung twice in a row: it is shown from the first time.
   automatic,why=True,'line_repeated_first_occurrence';start,source=(new,'lyrics-first') if new<=old else (old,'asr')
  elif adlib:
   # The ASR-anchored start skips the ad-lib and lands on the line's own words.
   automatic,why,(start,source)=True,'adlib_skipped',(old,'asr')
  elif difference is not None:
   if difference<=HYBRID['agreeSeconds']:automatic,why,start,source=True,'methods_agree',new,'lyrics-first'
   elif difference<=HYBRID['onsetBackedSeconds']:
    backed_new=strict;backed_old=old_auto and near_strong(old,HYBRID['onsetMatchSeconds'])
    if backed_new!=backed_old:automatic,why,start,source=True,'onset_backed_'+('lyrics_first' if backed_new else 'asr'),(new if backed_new else old),('lyrics-first' if backed_new else 'asr')
    # Both candidates within the lyric-video tolerance: the better-supported one is used.
    else:automatic,why,(start,source)=True,'within_lyric_tolerance',chosen
  elif strict and old is None and song_heard:
   # The recognizer missed this line, but it heard the song's lyrics overall (another song's
   # lyrics are caught by lyrics_mismatch) and the lyrics-first start is strictly confirmed.
   automatic,why,start,source=True,'lyrics_first_confirmed_song_heard',new,'lyrics-first'
  if not automatic:
   why=('asr_contradicts_lyrics_first' if strict and difference is not None else 'no_asr_cross_check' if new is not None and old is None else 'methods_disagree' if difference is not None else 'single_unconfirmed_estimate')
   start,source=chosen
  end=lyric.get('coarseEnd') if source=='lyrics-first' else heard.get('end')
  if not (isinstance(end,(int,float)) and start is not None and end>start):end=None
  reasons=[] if automatic else [why]
  method={'methods_agree':'hybrid-agreement','line_repeated_first_occurrence':'hybrid-repeated-line'}.get(why,'hybrid-onset-backed' if automatic else 'hybrid-review')
  evidence={'decision':why,'startSource':source,'lyricsFirstStart':new,'lyricsFirstStatus':lyric['status'],'lyricsFirstReasons':lyric.get('reasons',[]),'asrStart':old,'asrStatus':heard.get('startStatus'),'asrReasons':heard.get('startReasons',[]),'difference':None if difference is None else round(difference,3),'onset':lyric.get('onset'),'adlibAtLyricsFirstStart':adlib,'independentAgreement':why=='methods_agree'}
  out.append({'lineId':line['lineId'],'start':start,'end':end,'status':'automatic' if automatic else 'review','startStatus':'automatic' if automatic else 'review','startReasons':reasons,'method':method,'startMethod':method,'evidence':evidence})
 previous=None
 for row in out:
  if row['start'] is None:continue
  if previous is not None and row['start']<=previous['start']:
   for affected in (previous,row):
    if 'start_order' not in affected['startReasons']:affected['startReasons'].append('start_order')
    affected['status']=affected['startStatus']='review'
  previous=row
 return out

def line_span(text,normalize):
 """Shortest time a sung line can take before the next one starts."""
 return max(POLICY['minLineSpacing'],POLICY['minSecondsPerChar']*len(normalize(text)))

def review_runs(lines,rows,onsets,duration,normalize):
 """Runs of review lines between automatic starts, with the clip times to hear: vocal onsets and
 the lines' own candidates strictly inside the gap."""
 fixed=[row.get('startStatus')=='automatic' and isinstance(row.get('start'),(int,float)) for row in rows];runs=[];i=0
 while i<len(rows):
  if fixed[i]:i+=1;continue
  j=i
  while j+1<len(rows) and not fixed[j+1]:j+=1
  lower=rows[i-1]['start']+line_span(lines[i-1]['text'],normalize) if i else 0.;upper=rows[j+1]['start'] if j+1<len(rows) else duration
  values={item['time'] for item in onsets}
  for row in rows[i:j+1]:
   evidence=row.get('evidence') or {}
   values|={value for value in (row.get('start'),evidence.get('lyricsFirstStart'),evidence.get('asrStart')) if isinstance(value,(int,float))}
  times=sorted({round(value,2) for value in values if lower<value<upper})
  if times:runs.append({'lines':list(range(i,j+1)),'lower':lower,'upper':upper,'times':times})
  i=j+1
 return runs

def clip_words(text,normalize):
 return [word for word in text.split() if normalize(word)]

def opening_heard(text,expected,normalize):
 """(similarity, word index, heard characters): the heard words from that index on read like the
 line's opening (compared over the shorter of the two)."""
 words=[normalize(word) for word in clip_words(text,normalize)];best=(0.,0)
 for index in range(len(words)):
  rest=''.join(words[index:]);size=min(len(expected),len(rest))
  if size<min(RECHECK['minOpeningCharacters'],len(expected)):break
  value=sound_similarity(rest[:size],expected[:size])
  if value>best[0]+1e-9:best=(value,index)
 return best[0],best[1],len(''.join(words))

def recheck(lines,rows,runs,heard,onsets,normalize,locate=None):
 """Moves review starts to where a short clip hears the line's opening. heard = {clip time: text};
 locate(time, word index, lead) -> start of that heard word by the forced aligner, or None.
 Statuses are unchanged (the user confirms); returns (rows, number of moved starts)."""
 out=[dict(row) for row in rows];expected=[normalize(line['text']) for line in lines];moved=0
 for run in runs:
  times,indices=run['times'],run['lines'];heard_at={(k,t):opening_heard(heard.get(t,''),expected[k],normalize) for k in indices for t in times}
  # Ordered assignment maximizing similarity; keeping the candidate is worth the threshold.
  best={run['lower']:(0.,[])}
  for k in indices:
   start=rows[k].get('start');own=round(start,2) if isinstance(start,(int,float)) else None;span=line_span(lines[k]['text'],normalize);following={}
   for last,(gain,path) in best.items():
    options=[(None,RECHECK['openingSimilarity'],max(last,own+span) if own is not None and own>=last else last)]
    options+=[(t,heard_at[(k,t)][0]+(RECHECK['candidateBonus'] if t==own else 0),t+span) for t in times if t>=last]
    for t,value,state in options:
     if state not in following or gain+value>following[state][0]:following[state]=(gain+value,path+[t])
   best=following
  path=max(best.values(),key=lambda item:item[0])[1]
  for n,(k,t) in enumerate(zip(indices,path)):
   if t is None:continue
   similarity,word,_=heard_at[(k,t)];limit=min([x for x in path[n+1:] if x is not None]+[run['upper'],t+RECHECK['clipSeconds']+.5])
   chain=[];size=0
   for u in times:
    if u<t or u>=limit:continue
    value,index,heard_size=heard_at[(k,u)];reads=index==0 and value>=max(RECHECK['openingSimilarity'],similarity-RECHECK['chainDrop'])
    if reads and chain and heard_size<size:break
    if reads:chain.append(u);size=heard_size
    elif chain:break
   source=None
   if chain:found,source=chain[-1],'heard_opening'
   elif locate is not None:
    leads=RECHECK['alignLeads'];timed=[locate(t,word,lead) for lead in leads]
    if all(value is not None for value in timed) and max(timed)-min(timed)<=RECHECK['alignAgreement'] and all(value-(t-lead)>RECHECK['cropEdgeSeconds'] for value,lead in zip(timed,leads)):
     at=sum(timed)/len(timed);snapped=nearest(onsets,at,POLICY['strongSnap'],'strong') or nearest(onsets,at,POLICY['weakSnap'],'weak')
     found,source=(snapped['time'] if snapped else at),'aligned_clip'
   if source is None:continue
   previous=next((out[x]['start'] for x in range(k-1,-1,-1) if isinstance(out[x].get('start'),(int,float))),-1.)
   old=out[k].get('start')
   if not previous<found<run['upper'] or (isinstance(old,(int,float)) and abs(found-old)<.05):continue
   out[k].update(start=round(found,3),end=None,method='hybrid-review-recheck',startMethod='hybrid-review-recheck',startReasons=['recheck_located']+[reason for reason in out[k].get('startReasons',[]) if reason!='recheck_located'],
    evidence={**(out[k].get('evidence') or {}),'recheck':{'source':source,'clip':t,'heard':heard.get(t,''),'similarity':round(similarity,3),'previousStart':old}})
   moved+=1
 return out,moved
