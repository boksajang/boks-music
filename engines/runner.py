"""Windows/macOS Stem boundary. Stdout JSONL, diagnostics on stderr.

Music/Cover run exclusively through the JavaScript native-engine adapter.
Each process owns one GPU job and releases it on exit. No synthetic audio.
"""
from __future__ import annotations
import argparse
import contextlib
import json
import os
from pathlib import Path
import signal
import sys
import time
import traceback

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
OUTPUT = sys.stdout
START = time.monotonic()
CANCELLED = False

def emit(kind, **data):
    OUTPUT.write(json.dumps(dict(type=kind, **data), ensure_ascii=False) + "\n")
    OUTPUT.flush()

def stage(label, **data):
    emit("progress", stage=label, elapsedSeconds=round(time.monotonic()-START, 1), **data)

def cancel(*_):
    global CANCELLED
    CANCELLED = True

def check_cancel():
    if CANCELLED:
        raise InterruptedError("작업이 취소되었습니다.")

def selected_device(requested, torch, platform=None):
    host = platform or sys.platform
    if host not in ('win32', 'darwin'):
        raise RuntimeError('Windows와 macOS 런타임만 지원합니다.')
    allowed = ('cuda', 'cpu') if host == 'win32' else ('mps', 'cpu')
    if requested not in allowed:
        raise RuntimeError('현재 운영체제에서 지원하지 않는 추론 장치입니다.')
    if requested == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('선택한 CUDA 장치를 사용할 수 없습니다.')
    if requested == 'mps' and not (torch.backends.mps.is_built() and torch.backends.mps.is_available()):
        raise RuntimeError('선택한 MPS 장치를 사용할 수 없습니다.')
    return requested

def configure_separator_device(separator, torch, device):
    # Override auto detection before load_model creates the actual architecture.
    separator.torch_device = torch.device(device)
    separator.torch_device_cpu = torch.device('cpu')
    separator.torch_device_mps = torch.device('mps') if device == 'mps' else None
    separator.onnx_execution_provider = ['CUDAExecutionProvider'] if device == 'cuda' else ['CPUExecutionProvider']

STEM_NAMES = ("Vocals", "Instrumental", "Drums", "Bass", "Guitar", "Piano", "Other", "No_Vocals", "Strings")

def stems(request, settings, output):
    import torch
    device = selected_device(settings.get('stemDevice', 'mps' if sys.platform == 'darwin' else 'cuda'), torch)
    from audio_separator.separator import Separator
    mode = request.get("stemMode", "two")
    if mode not in ("two", "multi"):
        raise RuntimeError("알 수 없는 Stem 분리 방식입니다.")
    stage("Multi-track 분리 모델 준비 중" if mode == "multi" else "Vocal / Instrumental 분리 모델 준비 중")
    # Lyric analysis only needs the vocal: "singleStem" skips writing the other stem.
    single = request.get("singleStem") if mode == "two" else None
    if single not in (None, "Vocals", "Instrumental"):
        raise RuntimeError("알 수 없는 Stem 출력 지정입니다.")
    separator = Separator(output_dir=str(output), output_format="WAV", model_file_dir=str(Path(settings["modelPath"])/"stems"), output_single_stem=single)
    model = settings.get("stemModel", "model_bs_roformer_ep_317_sdr_12.9755.ckpt")
    if mode == "multi":
        from multi_stems import ensure_multi, multi_separator, MODEL
        model_root = ensure_multi(Path(settings["modelPath"])/"stems", stage)
        separator = multi_separator(model_root, output_dir=str(output), output_format="WAV", use_soundfile=True, mdxc_params={"batch_size": 1, "segment_size": 256, "override_model_segment_size": True})
        model = MODEL
    configure_separator_device(separator, torch, device)
    if device == 'cuda':
        torch.cuda.reset_peak_memory_stats()
    separator.load_model(model_filename=model)
    stage("보컬 / 악기별 6파트 분리 중" if mode == "multi" else "Vocal / Instrumental 분리 중")
    try:
        # Short names keep Windows paths under 260 characters: the default "<source>_(Stem)_<model>"
        # name overflowed when long source names met deep job folders. "(Stem)" still drives stemLabel.
        files = separator.separate(request["audioPath"], {name: f"stem_({name})" for name in STEM_NAMES})
    except torch.cuda.OutOfMemoryError as exc:
        raise RuntimeError("GPU 메모리가 부족해 선택한 분리 모델을 실행하지 못했습니다. 다른 GPU 작업을 종료하거나 기본 6파트 모델을 선택하세요.") from exc
    check_cancel()
    paths = [str((output/filename).resolve()) for filename in files]
    if len(paths) != (6 if mode == "multi" else 1 if single else 2) or not all(Path(x).is_file() for x in paths):
        raise RuntimeError("분리 결과 파일이 완전하지 않습니다.")
    raw_count = len(paths)
    emit("result", stems=paths, metadata=dict(engine="audio-separator", model=model, stemMode=mode, rawStemCount=raw_count, peakCudaAllocatedMB=round(torch.cuda.max_memory_allocated()/2**20) if torch.cuda.is_available() else 0, listeningValidated=False))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    signal.signal(signal.SIGINT, cancel)
    signal.signal(signal.SIGTERM, cancel)
    try:
        if args.probe:
            import importlib
            modules, import_errors = {}, {}
            # Package directories can exist after a failed dependency install.
            # Import the actual entry point, without constructing a model.
            for name, entry in (("torch", "torch"), ("audio_separator", "audio_separator.separator")):
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        imported = importlib.import_module(entry)
                        if name == "audio_separator":
                            getattr(imported, "Separator")
                    modules[name] = True
                except Exception as exc:
                    modules[name] = False
                    import_errors[name] = f"{type(exc).__name__}: {exc}"
            data = dict(modules=modules, importErrors=import_errors, audio_separator=modules["audio_separator"], python=sys.executable, platform=sys.platform, cuda=False)
            if modules["torch"]:
                import torch
                data["cuda"] = torch.cuda.is_available()
                data["mpsBuilt"] = torch.backends.mps.is_built()
                data["mps"] = torch.backends.mps.is_available()
                data["torchVersion"] = torch.__version__
                if data["cuda"]:
                    data.update(gpu=torch.cuda.get_device_name(), vramGiB=round(torch.cuda.get_device_properties(0).total_memory/2**30, 2), bf16=torch.cuda.is_bf16_supported())
            if args.request:
                settings = json.loads(Path(args.request).read_text(encoding="utf-8-sig")).get("settings", {})
                root = Path(settings.get("modelPath", "."))
                data["checkpoint"] = (root/"stems"/settings.get("stemModel", "model_bs_roformer_ep_317_sdr_12.9755.ckpt")).is_file()
            available = modules["torch"] and modules["audio_separator"]
            emit("probe", available=available, message="분리 런타임 확인 완료; 모델 로딩 및 청취 검증은 별도입니다." if available else "분리 런타임 설치가 필요합니다.", **data)
            return 0
        if not args.request:
            parser.error("--request is required unless --probe is used")
        request = json.loads(Path(args.request).read_text(encoding="utf-8-sig"))
        settings = request["settings"]
        cache_root = Path(settings["modelPath"])/"cache"
        runtime_temp = Path(settings["modelPath"])/"temp"
        locations = dict(HF_HOME=Path(settings["modelPath"])/"huggingface", HF_HUB_CACHE=Path(settings["modelPath"])/"huggingface"/"hub", TORCH_HOME=Path(settings["modelPath"])/"torch", XDG_CACHE_HOME=cache_root, NUMBA_CACHE_DIR=cache_root/"numba", MPLCONFIGDIR=cache_root/"matplotlib", TEMP=runtime_temp, TMP=runtime_temp)
        for key, folder in locations.items():
            folder.mkdir(parents=True, exist_ok=True)
            os.environ[key] = str(folder)
        if settings.get("ffmpegPath"):
            os.environ["PATH"] = str(Path(settings["ffmpegPath"]).parent) + os.pathsep + os.environ.get("PATH", "")
        if request.get("operation") == "stems" and settings.get("stemDevice") == "cpu":
            os.environ["CUDA_VISIBLE_DEVICES"] = ""
        output = Path(request["outputDir"]).resolve()
        output.mkdir(parents=True, exist_ok=True)
        # Third-party print() output must never corrupt JSONL protocol.
        with contextlib.redirect_stdout(sys.stderr):
            operation = request["operation"]
            if operation == "stems":
                stems(request, settings, output)
            else:
                raise ValueError("지원하지 않는 작업입니다.")
        return 0
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        message = str(exc)
        if isinstance(exc, ModuleNotFoundError):
            message = "필요한 Python 엔진 패키지가 없습니다. 엔진 설치 안내를 확인하세요."
        emit("error", message=message, detail=type(exc).__name__, cancelled=isinstance(exc, InterruptedError))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
