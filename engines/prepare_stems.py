"""Finish an explicitly selected stem installation; no synthetic quality checks."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--profile', required=True, choices=('stems-cpu', 'stems-cuda', 'stems-mps'))
    parser.add_argument('--download-models', action='store_true')
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    protocol = sys.stdout
    def event(kind, **fields):
        protocol.write(json.dumps(dict(type=kind, **fields), ensure_ascii=False) + '\n')
        protocol.flush()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            import imageio_ffmpeg
            import torch
            binary_dir = Path(sys.executable).parent
            ffmpeg = binary_dir/('ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
            if not ffmpeg.exists():
                shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), ffmpeg)
            os.environ['PATH'] = str(binary_dir) + os.pathsep + os.environ.get('PATH', '')
            subprocess.run([str(ffmpeg), '-version'], check=True, stdout=sys.stderr, stderr=sys.stderr)
            if args.profile == 'stems-cuda' and not torch.cuda.is_available():
                raise RuntimeError('CUDA용 엔진 패키지는 설치했지만 GPU를 사용할 수 없습니다. NVIDIA 드라이버를 확인하고 통합 설치를 다시 실행하세요.')
            if args.profile == 'stems-mps' and not torch.backends.mps.is_available():
                raise RuntimeError('MPS를 사용할 수 없습니다. Apple Silicon 및 macOS 버전을 확인하세요.')
            from audio_separator.separator import Separator
            model_root = args.root.resolve()/'stems'
            model_root.mkdir(parents=True, exist_ok=True)
            model = 'model_bs_roformer_ep_317_sdr_12.9755.ckpt'
            if args.download_models:
                event('progress', stage='Vocal / Instrumental 모델 다운로드 및 로딩 중')
                separator = Separator(model_file_dir=str(model_root), output_format='WAV', use_soundfile=True)
                separator.load_model(model_filename=model)
                del separator
                from multi_stems import ensure_multi, multi_separator, MODEL
                ensure_multi(model_root, lambda message: event("progress", stage=message))
                multi = multi_separator(model_root, output_format="WAV", use_soundfile=True)
                multi.load_model(model_filename=MODEL)
                del multi
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            settings = dict(stemPython=sys.executable, stemDevice={'stems-cuda': 'cuda', 'stems-mps': 'mps'}.get(args.profile, 'cpu'), ffmpegPath=str(ffmpeg), modelPath=str(args.root.resolve()), stemModel=model)
            result = dict(profile=args.profile, settings=settings, **settings, modelDownloaded=args.download_models, inferenceValidated=False, listeningValidated=False)
            receipt = binary_dir.parent/'boks-install.json'
            receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        event('result', **result)
        return 0
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        event('error', message=str(exc))
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
