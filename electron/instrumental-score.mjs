// Native ABC subset. The overlap policy matches YuE2 instrumentalize.convert_score:
// retain every Vocal event; subtract its occupied intervals from Ins events.
const durations = [48,32,24,16,12,8,6,4,3,2,1];
const natural = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const keys = {};
for (const names of ['Cb Gb Db Ab Eb Bb F C G D A E B F# C#','Abm Ebm Bbm Fm Cm Gm Dm Am Em Bm F#m C#m G#m D#m A#m']) names.split(' ').forEach((key,i)=>keys[key]=i-7);
const fail = message => { throw new Error('Instrumental 변환: '+message); };
const expand = line => line.replace(/\|$/, '').split('|').flatMap(bar=>{ const m=/^Z([1-4])?$/.exec(bar.trim());return m?Array(Number(m[1]||1)).fill('Z'):[bar.trim()]; });

export function instrumentalScore(abc) {
  const lines=abc.replace(/\r/g,'').trimEnd().split('\n');
  const meter=/^M:(\d+)\/(\d+)$/.exec(lines[2]), unit=/^L:1\/(\d+)$/.exec(lines[3]);
  if(lines[0]!=='X:1'||lines[1]!=='T:'||!meter||!unit||!lines[5]?.startsWith('V: Vocal ')||!lines[6]?.startsWith('V: Ins '))fail('native ABC 헤더가 필요합니다.');
  const length=Number(meter[1])/Number(meter[2])*Number(unit[1]), key=lines[7]?.slice(2);
  if(!Number.isInteger(length)||length<=0||!(key in keys))fail('지원하지 않는 박자 또는 조성입니다.');
  const signature=Object.fromEntries(Object.keys(natural).map(k=>[k,0]));
  for(const letter of (keys[key]>0?'FCGDAEB':'BEADGCF').slice(0,Math.abs(keys[key])))signature[letter]=Math.sign(keys[key]);
  const voices={Vocal:{notes:[],chords:[],time:0,pending:null},Ins:{notes:[],chords:[],time:0,pending:null}}, groups=[];
  function parseBar(body,voice) {
    const start=voice.time, local={}; let offset=0;
    if(body==='Z'){if(voice.pending)fail('타이가 쉼표로 이어집니다.');voice.time+=length;return;}
    const tokens=/"([^"\n]*)"|(?:(\^\^|__|\^|_|=)?([A-Ga-gz])([,']*)(\d*)(-?))/gy;
    for(let cursor=0;cursor<body.length;){
      if(/\s/.test(body[cursor])){cursor++;continue;}
      tokens.lastIndex=cursor;const m=tokens.exec(body);if(!m)fail('지원하지 않는 음표 표기가 있습니다.');cursor=tokens.lastIndex;
      if(offset>=length)fail('마디 길이를 초과합니다.');
      if(m[1]!==undefined){voice.chords.push({start:start+offset,text:m[1]});continue;}
      const [, ,acc,note,oct,num,tie]=m, duration=Number(num||1);
      if(!durations.includes(duration)||offset+duration>length)fail('마디 길이 또는 음표 길이가 올바르지 않습니다.');
      if(note==='z'){if(acc||oct||tie||voice.pending)fail('쉼표 또는 타이가 올바르지 않습니다.');}
      else {
        const letter=note.toUpperCase();if(oct.includes(',')&&oct.includes("'"))fail('혼합 옥타브 표기입니다.');
        const written=60+natural[letter]+(note===letter?0:12)+12*([...oct].filter(c=>c==="'").length-[...oct].filter(c=>c===',').length);
        if(acc)local[letter]={'=':0,'_':-1,'__':-2,'^':1,'^^':2}[acc];
        let pitch=written+(local[letter]??signature[letter]);
        if(voice.pending){if(!acc&&written===voice.pending.written)pitch=voice.pending.pitch;if(pitch!==voice.pending.pitch)fail('타이가 피치를 변경합니다.');voice.notes.at(-1).duration+=duration;}
        else {if(pitch<0||pitch>127)fail('MIDI 음역을 벗어납니다.');voice.notes.push({start:start+offset,pitch,duration});}
        voice.pending=tie?{pitch,written}:null;
      }
      offset+=duration;
    }
    if(offset!==length)fail('마디 길이가 박자와 다릅니다.');voice.time+=length;
  }
  for(let i=8;i<lines.length;i++){
    if(lines[i].startsWith('% '))continue;
    if(lines[i]!=='V: Vocal'||lines[i+2]!=='V: Ins')fail('박자/조성 변경 또는 악보 표기를 검토해야 합니다.');
    const vocal=expand(lines[i+1]),ins=expand(lines[i+3]);if(vocal.length!==ins.length)fail('마디 수가 다릅니다.');
    groups.push({line:i,start:voices.Vocal.time,bars:vocal.length});
    vocal.forEach(b=>parseBar(b,voices.Vocal));ins.forEach(b=>parseBar(b,voices.Ins));i+=3;
  }
  if(voices.Vocal.pending||voices.Ins.pending)fail('끝나지 않은 타이가 있습니다.');
  const merged=voices.Vocal.notes.map(n=>({...n})), affected=[];
  for(const [index,note] of voices.Ins.notes.entries()){
    let segments=[[note.start,note.start+note.duration]];
    for(const v of voices.Vocal.notes)segments=segments.flatMap(([a,b])=>v.start>=b||v.start+v.duration<=a?[[a,b]]:[[a,Math.min(b,v.start)],[Math.max(a,v.start+v.duration),b]].filter(([x,y])=>y>x));
    if(segments.length!==1||segments[0][0]!==note.start||segments[0][1]!==note.start+note.duration)affected.push({insNote:index,...note,retainedSegments:segments});
    for(const [start,end] of segments)merged.push({start,pitch:note.pitch,duration:end-start});
  }
  merged.sort((a,b)=>a.start-b.start);if(!merged.length)fail('연주할 음표가 없습니다.');
  // Every accidental is explicit so joining voices cannot change sounding pitches.
  function spelling(pitch){const names=['=C','^C','=D','^D','=E','=F','^F','=G','^G','=A','^A','=B'];const octave=Math.floor(pitch/12)-5;return names[pitch%12]+(octave<0?',':"'").repeat(Math.abs(octave));}
  function render(start,notes,chords){
    const end=start+length;let cursor=start,out='';
    while(cursor<end){
      for(const c of chords.filter(c=>c.start===cursor))out+='"'+c.text+'"';
      const note=notes.find(n=>n.start<=cursor&&n.start+n.duration>cursor);
      let next=note?Math.min(end,note.start+note.duration):Math.min(end,...notes.filter(n=>n.start>cursor).map(n=>n.start));
      next=Math.min(next,...chords.filter(c=>c.start>cursor).map(c=>c.start));
      const amount=durations.find(d=>d<=next-cursor);if(!amount)fail('음표를 정수 길이로 표현할 수 없습니다.');
      out+=(note?spelling(note.pitch):'z')+(amount===1?'':amount)+(note&&cursor+amount<note.start+note.duration?'-':'');cursor+=amount;
    }
    return out;
  }
  for(const group of groups){const starts=Array.from({length:group.bars},(_,i)=>group.start+i*length);lines[group.line+1]=starts.map(s=>render(s,[],voices.Vocal.chords)).join('|')+'|';lines[group.line+3]=starts.map(s=>render(s,merged,[])).join('|')+'|';}
  return {abc:lines.join('\n')+'\n',movedNotes:voices.Vocal.notes.length,report:{overlapPolicy:'vocal',vocalPitchOnsetDurationPreserved:true,meterAndTempoPreserved:true,timeUnit:`1/${unit[1]} whole note`,affectedInsNotes:affected,sourceVocalNotes:voices.Vocal.notes.length,sourceInsNotes:voices.Ins.notes.length,outputInsNotes:merged.length}};
}
