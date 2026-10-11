"""Pinned Windows-compatible BS-RoFormer six-part model, shared by setup and inference."""
import hashlib
from pathlib import Path
import urllib.request

REVISION = '2b98254b19bdab07ce225d884ec4aa9dd8aafce1'
MODEL = 'BS-Rofo-SW-Fixed.ckpt'
CONFIG = 'BS-Rofo-SW-Fixed.yaml'
FILES = [(MODEL, 699412152, '24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e'), (CONFIG, 4613, 'f9fada9f94e5ba2d2e4600196299459294bc5f532b314c209cc156ac63e4329b')]

def ensure_multi(root, progress=lambda message: None):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    for name, size, digest in FILES:
        dest = root/name
        if dest.is_file() and dest.stat().st_size == size:
            with dest.open('rb') as cached:
                if hashlib.file_digest(cached, 'sha256').hexdigest() == digest:
                    continue
        progress('Multi-track 필수 모델 자동 설치 중 · ' + name)
        partial = dest.with_suffix(dest.suffix + '.partial')
        try:
            url = f'https://huggingface.co/FractalSurfer/BS-RoFormer-SW-6stem/resolve/{REVISION}/{name}'
            with urllib.request.urlopen(url, timeout=90) as response, partial.open('wb') as output:
                total = 0
                next_update = 64*1024*1024
                digest_state = hashlib.sha256()
                while block := response.read(1024*1024):
                    total += len(block)
                    if total > size:
                        raise RuntimeError('Multi-track 모델 크기가 올바르지 않습니다.')
                    output.write(block)
                    digest_state.update(block)
                    if total >= next_update:
                        progress(f'모델 다운로드 중 · {total*100//size}%')
                        next_update += 64*1024*1024
            if total != size or digest_state.hexdigest() != digest:
                raise RuntimeError('Multi-track 모델 무결성 검사에 실패했습니다.')
            partial.replace(dest)
        finally:
            partial.unlink(missing_ok=True)
    return root

def multi_separator(root, **kwargs):
    model = MODEL
    config = CONFIG
    from audio_separator.separator import Separator
    class PinnedSeparator(Separator):
        def download_model_files(self, filename):
            if filename != model:
                return super().download_model_files(filename)
            self.model_friendly_name = 'BS-RoFormer SW · 6 Stem'
            self.model_is_uvr_vip = False
            return filename, 'MDXC', self.model_friendly_name, str(Path(root)/model), str(Path(root)/config)
    return PinnedSeparator(model_file_dir=str(root), **kwargs)
