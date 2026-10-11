param([string]$RuntimeRoot='', [string]$ModelRoot='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PYTHONIOENCODING='utf-8'
$project=Split-Path $PSScriptRoot -Parent
if(!$RuntimeRoot){$RuntimeRoot=Join-Path $project 'engine-packages/runtimes/lyrics-alignment'}
if(!$ModelRoot){$ModelRoot=Join-Path $project 'engine-packages/models/lyrics-alignment'}
$RuntimeRoot=[IO.Path]::GetFullPath($RuntimeRoot);$ModelRoot=[IO.Path]::GetFullPath($ModelRoot)
$packagePrefix=[IO.Path]::GetFullPath((Join-Path $project 'engine-packages')).TrimEnd('\')+'\'
foreach($location in @($RuntimeRoot,$ModelRoot)){if(!$location.StartsWith($packagePrefix,[StringComparison]::OrdinalIgnoreCase)){throw '가사 정렬 설치는 프로젝트 engine-packages 내부만 허용합니다.'}}
$uv=$null;$base=$null;$torchIndex='https://download.pytorch.org/whl/cu128'
foreach($profile in @('stems-cuda','stems-cpu')){
    $stemRoot=Join-Path $project ('engine-packages/runtimes/'+$profile)
    $candidate=Join-Path $stemRoot 'uv.exe';$pythonRoot=Join-Path $stemRoot 'python'
    if((Test-Path -LiteralPath $candidate) -and (Test-Path -LiteralPath $pythonRoot)){
        $base=Get-ChildItem -LiteralPath $pythonRoot -Filter python.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName
        if($base){$uv=$candidate;if($profile -eq 'stems-cpu'){$torchIndex='https://download.pytorch.org/whl/cpu'};break}
    }
}
if(!$uv -or !$base){throw '프로젝트 음악 모델 통합 설치를 먼저 완료하세요. 전용 Python 설치 도구가 필요합니다.'}
$env:UV_CACHE_DIR=Join-Path $RuntimeRoot 'uv-cache';$env:UV_NO_BUILD='1';$env:UV_NO_MODIFY_PATH='1';$env:UV_PYTHON_INSTALL_DIR=Join-Path $RuntimeRoot 'python';$env:UV_PYTHON_BIN_DIR=Join-Path $RuntimeRoot 'python-bin'
$env:TEMP=Join-Path $RuntimeRoot 'temp';$env:TMP=$env:TEMP;$env:PIP_CACHE_DIR=Join-Path $RuntimeRoot 'pip-cache';$env:HF_HOME=Join-Path $ModelRoot 'cache/huggingface';$env:TORCH_HOME=Join-Path $ModelRoot 'cache/torch';$env:XDG_CACHE_HOME=Join-Path $ModelRoot 'cache'
New-Item -ItemType Directory -Force -Path $RuntimeRoot,$ModelRoot,$env:TEMP | Out-Null
$venv=Join-Path $RuntimeRoot 'venv';$python=Join-Path $venv 'Scripts/python.exe'
function Invoke-Uv([string[]]$Arguments){ $ErrorActionPreference='Continue'; & $uv @Arguments 2>&1 | ForEach-Object { [Console]::Error.WriteLine($_) };$exitCode=$LASTEXITCODE;$ErrorActionPreference='Stop';if($exitCode -ne 0){throw '가사 정렬 Python 휠 설치에 실패했습니다. 소스 빌드는 실행하지 않았습니다.'}}
Write-Output '{"type":"progress","stage":"노래 인식·가사 정렬 Python 런타임 준비 중"}'
if(!(Test-Path -LiteralPath $python)){Invoke-Uv -Arguments @('venv','--python',$base,$venv)}
Invoke-Uv -Arguments @('pip','install','--python',$python,'--only-binary',':all:','--index-url',$torchIndex,'torch==2.8.0','torchaudio==2.8.0')
Invoke-Uv -Arguments @('pip','install','--python',$python,'--only-binary',':all:','transformers==5.19.0','soundfile==0.13.1','scipy==1.17.1','soynlp==0.0.493','librosa==0.11.0')
& $python (Join-Path $PSScriptRoot 'setup-lyrics-models.py') --model-root $ModelRoot
if($LASTEXITCODE -ne 0){throw '가사 정렬 모델 다운로드 또는 무결성 확인에 실패했습니다.'}
& $python -c 'from transformers import Qwen3ASRForTokenClassification,Qwen3ASRForConditionalGeneration;import torch;print(torch.__version__)' | ForEach-Object { [Console]::Error.WriteLine($_) }
if($LASTEXITCODE -ne 0){throw '가사 정렬 런타임 확인에 실패했습니다.'}
@{type='result';pythonPath=$python;modelRoot=$ModelRoot}|ConvertTo-Json -Compress





