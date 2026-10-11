"""Download pinned official model snapshots to the shared model root.

No model executes here. The parent owns cancellation and must kill the process
tree. HF verifies transfer integrity and reuses its local cache. Partial downloads
are resumable. Progress on stderr is the actual Hugging Face transfer progress.
"""
import argparse
import json
from pathlib import Path

MODELS = {
    "YuE2-3B": ("m-a-p/YuE2-3B", "c044757a011169583f363168348ae380946efff8"),
    "YuE2-Vae": ("m-a-p/YuE2-Vae", "152733a19ad43aa67e367f9b5503ef8075bb5126"),
    "SheetSage2": ("m-a-p/SheetSage2", "05adf4efae66c4ecfbe52fccfe8a2811cde8ea49"),
}

def main():
    from huggingface_hub import snapshot_download
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--model", choices=MODELS, action="append")
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    for name in args.model or ["YuE2-3B", "YuE2-Vae"]:
        repo, revision = MODELS[name]
        print(json.dumps(dict(type="progress", stage=f"{name} 다운로드 중", model=name)), flush=True)
        snapshot_download(repo_id=repo, revision=revision, local_dir=str(args.root/name))
        manifest = dict(repo=repo, revision=revision, state="downloaded", inferenceValidated=False)
        (args.root/name/"boks-install.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps(dict(type="installed", model=name, revision=revision)), flush=True)

if __name__ == "__main__":
    main()
