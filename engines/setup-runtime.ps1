param(
    [string]$RuntimeRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'engine-packages\runtimes'),
    [ValidateSet('stems-cpu','stems-cuda')][string]$Profile = 'stems-cuda',
    [string]$ModelRoot = '',
    [switch]$DownloadModels
)
$ErrorActionPreference = 'Stop'
function Get-ArchiveSHA256([string]$File) {
    $stream = [IO.File]::OpenRead([IO.Path]::GetFullPath($File))
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
}
function Expand-RuntimeZip([string]$Archive, [string]$Destination) {
    # .NET APIs work in Windows PowerShell 5.1 even when launched from pwsh
    # with a PSModulePath that does not contain the legacy script modules.
    [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem')
    $root = [IO.Path]::GetFullPath($Destination)
    [void][IO.Directory]::CreateDirectory($root)
    $prefix = $root.TrimEnd('\') + '\'
    $zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
    try {
        foreach ($entry in $zip.Entries) {
            $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $entry.FullName))
            if (!$target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe runtime archive path' }
            if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) {
                [void][IO.Directory]::CreateDirectory($target)
            } else {
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
            }
        }
    } finally { $zip.Dispose() }
}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
if (!$ModelRoot) { $ModelRoot = Join-Path $RuntimeRoot 'models' }
$ModelRoot = [IO.Path]::GetFullPath($ModelRoot)
$env:UV_CACHE_DIR = Join-Path $RuntimeRoot 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $RuntimeRoot 'python'
$env:UV_PYTHON_BIN_DIR = Join-Path $RuntimeRoot 'python-bin'
$env:UV_NO_MODIFY_PATH = '1'
$env:HF_HOME = Join-Path $ModelRoot 'huggingface'
$env:HF_HUB_CACHE = Join-Path $env:HF_HOME 'hub'
$env:TORCH_HOME = Join-Path $ModelRoot 'torch'
$env:XDG_CACHE_HOME = Join-Path $ModelRoot 'cache'
$env:NUMBA_CACHE_DIR = Join-Path $ModelRoot 'cache\numba'
$env:MPLCONFIGDIR = Join-Path $ModelRoot 'cache\matplotlib'
$env:PIP_CACHE_DIR = Join-Path $ModelRoot 'cache\pip'
$env:TEMP = Join-Path $RuntimeRoot 'temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP,$env:NUMBA_CACHE_DIR,$env:MPLCONFIGDIR -Force | Out-Null
$uv = Join-Path $RuntimeRoot 'uv.exe'
if (!(Test-Path -LiteralPath $uv)) {
    Write-Output '{"type":"progress","stage":"프로젝트 전용 Python 설치 도구 다운로드 중"}'
    $archive = Join-Path $RuntimeRoot 'uv.zip'
    Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/download/0.12.23/uv-x86_64-pc-windows-msvc.zip' -OutFile $archive
    $checksumFile = Join-Path $RuntimeRoot 'uv.sha256'
    Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/download/0.12.23/uv-x86_64-pc-windows-msvc.zip.sha256' -OutFile $checksumFile
    $expected = (Get-Content -LiteralPath $checksumFile -Raw).Trim().Split(' ')[0]
    if ((Get-ArchiveSHA256 $archive) -ne $expected.ToLowerInvariant()) { throw 'uv checksum mismatch' }
    Expand-RuntimeZip $archive $RuntimeRoot
}
$pythonVersion = '3.11'
@{type='progress';stage="독립 Python $pythonVersion 설치 중"} | ConvertTo-Json -Compress
& $uv python install $pythonVersion
if ($LASTEXITCODE) { throw 'Python installation failed' }
$environment = Join-Path $RuntimeRoot $Profile
if (!(Test-Path -LiteralPath (Join-Path $environment 'Scripts\python.exe'))) {
    & $uv venv --python $pythonVersion $environment
    if ($LASTEXITCODE) { throw 'Environment creation failed' }
}
$python = Join-Path $environment 'Scripts\python.exe'
if ($Profile -like 'stems-*') {
    $extra = if ($Profile -eq 'stems-cuda') { 'gpu' } else { 'cpu' }
    # PyPI ORT >=1.27 defaults to CUDA 13; match the bundled Torch CUDA 12.8 DLLs.
    $onnxRuntime = if ($Profile -eq 'stems-cuda') { 'onnxruntime-gpu==1.23.2' } else { 'onnxruntime==1.23.2' }
    $torchIndex = if ($Profile -eq 'stems-cuda') { 'https://download.pytorch.org/whl/cu128' } else { 'https://download.pytorch.org/whl/cpu' }
    Write-Output '{"type":"progress","stage":"Stem용 PyTorch 설치 중"}'
    & $uv pip install --python $python --only-binary :all: 'torch==2.8.0' 'torchvision==0.23.0' --index-url $torchIndex
    if ($LASTEXITCODE) { throw 'Stem PyTorch installation failed' }
    Write-Output '{"type":"progress","stage":"음원 분리 엔진 및 로컬 FFmpeg 설치 중"}'
    & $uv pip install --python $python --only-binary :all: 'torch==2.8.0' 'torchvision==0.23.0' "audio-separator[$extra]==0.47.0" $onnxRuntime 'imageio-ffmpeg==0.6.0' 'numpy==2.2.6' 'numba==0.61.2' 'llvmlite==0.44.0' 'scipy==1.15.3'
    if ($LASTEXITCODE) { throw 'Stem dependency installation failed: compatible prebuilt Windows wheels are required; source compilation is disabled' }
    $helperArgs = @((Join-Path $PSScriptRoot 'prepare_stems.py'), '--root', $ModelRoot, '--profile', $Profile)
    if ($DownloadModels) { $helperArgs += '--download-models' }
    & $python @helperArgs
    if ($LASTEXITCODE) { throw 'Stem engine verification failed' }
    exit 0
}
