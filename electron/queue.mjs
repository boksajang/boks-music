import { randomUUID } from 'node:crypto';
// Jobs run in lanes: each lane is serial and lanes run side by side. Every job shares one lane
// unless `lane(job)` says otherwise; the app moves CLI-only agent work (lyrics, album art) to its
// own lane so a lyric request does not wait minutes behind a GPU music generation.
export class JobQueue {
  // `progress(job)` carries frequent progress updates (stage, percentage, remaining time) separately from
  // `notify`, which republishes the whole library and is kept for status changes.
  // `finished(job)` runs after a job ends failed or cancelled (cleanup of what it left).
  constructor({store,run,notify,progress=notify,finished=()=>{},log=()=>{},lane=()=>'engine'}) { Object.assign(this,{store,run,notify,progress,finished,log,lane}); this.stopped=false; this.lanes=new Map(); this.controllers=new Map(); this.clocks=new Map(); }
  get processing() { return [...this.lanes.values()].some(lane=>lane.processing); }
  // Settles once every lane is idle, including work queued while it was waiting.
  get pumpPromise() { const active=[...this.lanes.values()].map(lane=>lane.promise).filter(Boolean); return active.length?Promise.all(active).then(()=>this.pumpPromise):null; }
  async add(requests) {
    if(this.stopped)throw new Error('앱이 종료 중입니다. 다시 실행한 뒤 작업을 추가하세요.');
    const batchId=randomUUID();
    const jobs=requests.map((request,i)=>({id:randomUUID(),batchId,title:request.title||'음악 작업',type:request.operation,status:'queued',stage:'대기 중',createdAt:new Date().toISOString(),index:i+1,total:requests.length,request}));
    await this.store.mutate(s=>s.jobs.push(...jobs)); this.notify(); void this.pump(); return jobs;
  }
  async cancel(id) {
    const job=this.store.data.jobs.find(j=>j.id===id);
    if(!job||!['queued','running','needs-confirmation'].includes(job.status))return;
    // A cancelled job's process may still hold its files until it exits: it stays 'stopping' till then.
    if(job.status==='running'){Object.defineProperty(job,'stopping',{value:true,writable:true,configurable:true});this.controllers.get(job.id)?.abort();}
    await this.store.mutate(()=>Object.assign(job,{status:'cancelled',stage:'취소됨',finishedAt:new Date().toISOString()})); this.notify();
  }
  async resume(id,request){
    if(this.stopped)throw new Error('앱이 종료 중입니다.');
    const previous=this.store.data.jobs.find(job=>job.id===id);
    if(!previous||previous.status!=='needs-confirmation')throw new Error('다시 시작할 작업이 없습니다.');
    const before={...previous};
    const job={id:randomUUID(),batchId:randomUUID(),title:request.title||previous.title,type:request.operation,status:'queued',stage:'대기 중',createdAt:new Date().toISOString(),index:1,total:1,request};
    Object.defineProperty(job,'publishing',{value:true,writable:true});
    try{await this.store.mutate(data=>{previous.status='resumed';previous.stage='작업 다시 시작됨';previous.result={...previous.result,resumedJobId:job.id};data.jobs.push(job);});}
    catch(error){Object.assign(previous,before);this.store.data.jobs=this.store.data.jobs.filter(item=>item!==job);await this.store.save();throw error;}
    job.publishing=false;this.notify();void this.pump();
    return job;
  }
  /** An interrupted (app closed) or failed job runs again with the same request; the old record goes. */
  async rerun(id,overrides={}){
    if(this.stopped)throw new Error('앱이 종료 중입니다.');
    const previous=this.store.data.jobs.find(job=>job.id===id);
    if(!previous||!['interrupted','failed'].includes(previous.status))throw new Error('다시 실행할 작업이 없습니다.');
    if(!previous.request)throw new Error('작업 내용을 찾지 못해 다시 실행할 수 없습니다.');
    // The run uses today's settings (engine locations may have changed since).
    const request={...previous.request,...(previous.request.settings?{settings:{...this.store.data.settings}}:{}),...overrides};
    const job={id:randomUUID(),batchId:randomUUID(),title:previous.title,type:previous.type,status:'queued',stage:'대기 중',createdAt:new Date().toISOString(),index:1,total:1,request};
    await this.store.mutate(data=>{data.jobs=data.jobs.filter(item=>item!==previous);data.jobs.push(job);});this.notify();void this.pump();return job;
  }
  /** Removes an interrupted or failed job from the list. */
  async dismiss(id){
    const job=this.store.data.jobs.find(item=>item.id===id);
    if(!job||!['interrupted','failed'].includes(job.status))return;
    await this.store.mutate(data=>{data.jobs=data.jobs.filter(item=>item!==job);});this.notify();
  }
  next(name) { return this.store.data.jobs.find(j=>j.status==='queued'&&!j.publishing&&this.lane(j)===name); }
  pump() {
    if(!this.stopped)for(const name of new Set(this.store.data.jobs.filter(j=>j.status==='queued'&&!j.publishing).map(j=>this.lane(j))))this.pumpLane(name);
    return this.pumpPromise||Promise.resolve();
  }
  pumpLane(name) {
    let lane=this.lanes.get(name);
    if(!lane){lane={processing:false,promise:null};this.lanes.set(name,lane);}
    if(lane.promise)return lane.promise;
    // A job queued just as the lane finished its last one would otherwise wait for the next add().
    lane.promise=this.processLane(name,lane).finally(()=>{lane.promise=null;if(!this.stopped&&this.next(name))void this.pumpLane(name);});
    return lane.promise;
  }
  async processLane(name,lane) {
    if(lane.processing||this.stopped)return;
    lane.processing=true;
    try {
      for(let job;!this.stopped&&(job=this.next(name));) {
        const controller=new AbortController();this.controllers.set(job.id,controller);
        await this.store.mutate(()=>Object.assign(job,{status:'running',startedAt:new Date().toISOString(),stage:'작업 준비 중'})); this.notify();
        try {
          const result=await this.run(job,controller.signal,progress=>{
            if(job.status!=='running')return;
            job.stage=progress.stage||job.stage;
            // Percentages only come from a backend with a known denominator.
            if(Number.isFinite(progress.progress)&&progress.progress>=0&&progress.progress<=100)job.progress=progress.progress;
            else delete job.progress;
            if(progress.tokens!==undefined)job.tokens=progress.tokens;
            // Rendering reports frames: remaining time and speed (× real time) from the frames so far.
            if(progress.totalFrames>0&&progress.framesRendered>0){
              const now=Date.now(),clock=this.clocks.get(job.id)||{start:now,frames:progress.framesRendered};if(!this.clocks.has(job.id))this.clocks.set(job.id,clock);
              const elapsed=(now-clock.start)/1000,done=progress.framesRendered-clock.frames;
              if(elapsed>=2&&done>0){const rate=done/elapsed;job.eta=Math.round((progress.totalFrames-progress.framesRendered)/rate);if(progress.fps>0)job.speed=Math.round(rate/progress.fps*10)/10;}
            }else{delete job.eta;delete job.speed;}
            this.progress(job);
          });
          // A result marked committed (the video file is written) completes even if a cancel arrived late.
          if(!controller.signal.aborted||result?.committed) Object.assign(job,{status:result?.awaitingConfirmation?'needs-confirmation':'completed',stage:result?.awaitingConfirmation?'가사 시간 확인 필요':'완료',result,finishedAt:new Date().toISOString()});
          else Object.assign(job,{status:'cancelled',stage:'취소됨',finishedAt:new Date().toISOString()});
        } catch(error) {
          this.log(error,job.id);
          Object.assign(job,{status:controller.signal.aborted?'cancelled':'failed',stage:controller.signal.aborted?'취소됨':'작업 실패',error:controller.signal.aborted?undefined:error.message,finishedAt:new Date().toISOString()});
        } finally { this.controllers.delete(job.id);this.clocks.delete(job.id);delete job.progress;delete job.eta;delete job.speed;delete job.stopping; }
        await this.store.save(); this.notify();
        if(['failed','cancelled'].includes(job.status))try{await this.finished(job);}catch(error){this.log(error,job.id);}
      }
    } catch(error) { this.log(error); }
    finally { lane.processing=false; }
  }
  async shutdown() { this.stopped=true; for(const controller of this.controllers.values())controller.abort(); await this.pumpPromise; await this.store.save(); }
}
