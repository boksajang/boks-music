type Row=Record<string,any>;
const gb=(bytes:number)=>`${(bytes/1024**3).toFixed(1)}GB`;
const statusLabel:Record<string,string>={available:'설치 가능',slow:'느리게 동작',unavailable:'설치 불가'};
/** Local album art models: per family, variants from the lowest to the highest requirement, with this
 * PC's verdict. Installed variants are marked; impossible ones say why. */
export function ImageModelLayer({state,busy,installing,install,close}:{state:Row;busy:boolean;installing:string;install:(id:string)=>void;close:()=>void}){
 const hardware=state?.hardware||{};
 const recommended=state?.families?.flatMap((family:Row)=>family.variants).find((row:Row)=>row.id===state.recommendedId);
 return <div className="modal-backdrop" onClick={()=>!busy&&close()}><section className="modal image-model-layer" role="dialog" aria-modal="true" aria-labelledby="image-model-heading" onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'&&!busy)close();}}>
  <div className="modal-title"><div><span className="eyebrow">LOCAL IMAGE MODELS</span><h2 id="image-model-heading">로컬 이미지 모델</h2></div><button title="닫기" aria-label="로컬 이미지 모델 닫기" disabled={busy} onClick={close}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
  <p className="image-model-hardware">{state?.build?<>이 PC · <strong>{state.build.label}</strong> · {hardware.unknownVram?'GPU 메모리 확인 불가(4GB로 가정)':<>{hardware.shared?'통합 메모리':'GPU 메모리'} {hardware.gpuGB}GB</>} · 시스템 메모리 {hardware.ramGB}GB · 여유 공간 {hardware.diskGB}GB</>:state?.reason||'이 PC의 사양을 확인하고 있습니다.'}</p>
  {recommended&&<p className="image-model-recommendation">추천: <strong>{recommended.familyName} {recommended.quant}</strong> — 이 PC에서 품질과 속도의 균형이 가장 좋은 구성입니다.</p>}
  <div className="image-model-families">{(state?.families||[]).map((family:Row)=><section className="image-model-family" key={family.id}>
   <header><div><h3>{family.name}</h3><p>{family.description}</p></div><span>{family.parameters} · {family.license}</span></header>
   <ol>{family.variants.map((row:Row)=><li key={row.id} className={`image-model-row ${row.status}${row.recommended?' recommended':''}`}>
    <div className="image-model-name"><strong>{row.quant}</strong>{row.recommended&&<em>추천</em>}</div>
    <div className="image-model-info"><span>{row.note}</span><small>GPU {row.minVramGB}GB 이상 · {row.installed?'설치됨':`내려받기 ${gb(row.downloadBytes)}`}</small>{row.reason&&<small className="image-model-reason">{row.reason}</small>}</div>
    <div className="image-model-action">{row.installed?<span className="image-model-chip installed">설치됨</span>:row.status==='unavailable'?<span className="image-model-chip unavailable">설치 불가</span>:<button className={row.recommended?'primary':'secondary'} disabled={busy||!!installing} onClick={()=>install(row.id)}>{installing===row.id?'설치 요청 중…':'설치'}</button>}{!row.installed&&row.status==='slow'&&<small className="image-model-chip slow">{statusLabel.slow}</small>}</div>
   </li>)}</ol>
  </section>)}</div>
  <p className="field-help">모델은 이 프로젝트의 engine-packages 폴더에 설치되며, 내려받은 파일은 크기와 SHA-256으로 확인합니다. GPU 메모리 수치는 1024×1024 기준 예상값입니다. 두 모델 모두 Apache-2.0 라이선스입니다.</p>
 </section></div>;
}
