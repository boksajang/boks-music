param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[ValidateSet('runtime','cuda')][string]$Kind)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$targetRoot = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
$prefix = $targetRoot.TrimEnd('\') + '\'
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
$count = 0
$extracted = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
try {
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\','/')
        if ($Kind -eq 'runtime') {
            if (!$name.StartsWith('resources/yue2-cpp/')) { continue }
            $relative = $name.Substring('resources/yue2-cpp/'.Length)
        } else {
            $leaf = [IO.Path]::GetFileName($name)
            if ($leaf -notin @('cublas64_13.dll','cublasLt64_13.dll','LICENSE')) { continue }
            $relative = if ($leaf -eq 'LICENSE') { 'NVIDIA-CUBLAS-LICENSE' } else { $leaf }
        }
        if (!$relative -or $name.EndsWith('/')) { continue }
        if ($relative.Split('/') -contains '..') { throw 'Unsafe archive path' }
        $destinationPath = [IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
        if (!$destinationPath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escaped destination' }
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destinationPath)) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destinationPath,$true)
        [void]$extracted.Add($relative.Replace('\','/'))
        $count++
    }
} finally { $zip.Dispose() }
if ($count -eq 0) { throw 'Expected runtime files were not found in archive' }
$required = if ($Kind -eq 'runtime') { @('yue-server.exe','ggml.dll','ggml-base.dll','cuda13/ggml-cuda.dll') } else { @('cublas64_13.dll','cublasLt64_13.dll') }
foreach ($file in $required) {
    if (!$extracted.Contains($file)) { throw "Required archive entry is missing: $file" }
}
@{type='extracted';files=$count} | ConvertTo-Json -Compress
