import { createCanvasScene, unpackAnalysis } from '../canvas-scene.mjs';

// Frames are drawn at exact timestamps (frame / fps), never wall-clock time, so output is smooth at any speed.
const bridge = window.boksCanvasRender;
const bitmap = async bytes => (bytes ? createImageBitmap(new Blob([bytes])) : null);
async function encoderConfig({ width, height, fps, bitrate }) {
  const area = width * height, rate = area * fps;
  // H.264 High profile level sized to the frame (4.0 → 1080p30, 4.2 → 1080p60, 5.1 → 4K30, 5.2 → 4K60).
  const level = rate <= 1920 * 1088 * 30 ? '28' : area <= 1920 * 1088 && rate <= 1920 * 1088 * 64 ? '2A' : rate <= 4096 * 2304 * 30 ? '33' : '34';
  const base = { codec: `avc1.6400${level}`, width, height, bitrate, bitrateMode: 'variable', framerate: fps, avc: { format: 'annexb' }, latencyMode: 'quality' };
  for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software']) {
    const config = { ...base, hardwareAcceleration };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, hardware: hardwareAcceleration === 'prefer-hardware' };
  }
  throw Error('이 PC에서 H.264 영상 인코더를 사용할 수 없습니다.');
}
bridge.onJob(async job => {
  try {
    const started = performance.now();
    const [background, ...arts] = await Promise.all([bitmap(job.background), ...job.arts.map(bitmap)]);
    const scene = createCanvasScene({ scene: job.scene, width: job.width, height: job.height, tracks: job.tracks, options: job.options, images: { background, arts }, analyses: job.analyses.map(unpackAnalysis) });
    const canvas = new OffscreenCanvas(job.width, job.height), ctx = canvas.getContext('2d', { alpha: false });
    const { config, hardware } = await encoderConfig(job);
    let failure = null;
    const encoder = new VideoEncoder({ output: chunk => { const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes); bridge.chunk(bytes); }, error: error => { failure = error; } });
    encoder.configure(config);
    const keyInterval = Math.max(1, Math.round(job.fps * 2));
    for (let frame = 0; frame < job.frames; frame++) {
      if (failure) throw failure;
      scene.draw(ctx, frame / job.fps);
      const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(frame * 1e6 / job.fps), duration: Math.round(1e6 / job.fps) });
      encoder.encode(videoFrame, { keyFrame: frame % keyInterval === 0 }); videoFrame.close();
      if (encoder.encodeQueueSize > 24) await new Promise(resolve => encoder.addEventListener('dequeue', resolve, { once: true }));
      if (frame % 60 === 0) bridge.progress({ framesRendered: frame, totalFrames: job.frames });
    }
    await encoder.flush(); encoder.close();
    if (failure) throw failure;
    bridge.done({ frames: job.frames, hardware, codec: config.codec, seconds: (performance.now() - started) / 1000 });
  } catch (error) { bridge.fail(error?.message || error); }
});
