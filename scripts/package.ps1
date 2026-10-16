$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$taskRoot = Split-Path -Parent $PSScriptRoot
$taskExtension = Join-Path $taskRoot 'extension'
$taskManifest = Get-Content -LiteralPath (Join-Path $taskExtension 'manifest.json') -Raw | ConvertFrom-Json
$taskPackage = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$taskVersion = [string]$taskManifest.version
if ($taskVersion -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$' -or $taskVersion -ne [string]$taskPackage.version) {
    throw 'Manifest and package versions must match and be valid extension version numbers.'
}
$taskDist = Join-Path $taskRoot 'dist'
[System.IO.Directory]::CreateDirectory($taskDist) | Out-Null
$taskRuntimeArchive = Join-Path $taskDist "Twitch-English-v$taskVersion.zip"
$taskSourceArchive = Join-Path $taskDist "Twitch-English-v$taskVersion-source.zip"

function Write-ReleaseArchive {
    param([string]$ArchivePath, [object[]]$Entries)
    $taskStream = [System.IO.File]::Open($ArchivePath, [System.IO.FileMode]::Create)
    $taskZip = $null
    try {
        $taskZip = [System.IO.Compression.ZipArchive]::new($taskStream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
        foreach ($taskItem in ($Entries | Sort-Object EntryName -CaseSensitive)) {
            $taskEntry = $taskZip.CreateEntry($taskItem.EntryName.Replace('\', '/'), [System.IO.Compression.CompressionLevel]::Optimal)
            # Avoid local file timestamps and other machine-specific file metadata.
            $taskEntry.LastWriteTime = [System.DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [System.TimeSpan]::Zero)
            $taskInput = [System.IO.File]::OpenRead($taskItem.SourcePath)
            $taskOutput = $null
            try {
                $taskOutput = $taskEntry.Open()
                $taskInput.CopyTo($taskOutput)
            } finally {
                if ($null -ne $taskOutput) { $taskOutput.Dispose() }
                $taskInput.Dispose()
            }
        }
    } finally {
        if ($null -ne $taskZip) { $taskZip.Dispose() }
        $taskStream.Dispose()
    }
}

$taskRuntimeEntries = @(Get-ChildItem -LiteralPath $taskExtension -Recurse -File | ForEach-Object {
    @{ SourcePath = $_.FullName; EntryName = $_.FullName.Substring($taskExtension.Length + 1) }
})
# The runtime ZIP gets concise installation instructions in place of the developer README.
foreach ($taskDoc in @(
    @{ File = 'INSTALL.md'; Entry = 'README.md' },
    @{ File = 'PRIVACY.md'; Entry = 'PRIVACY.md' },
    @{ File = 'LICENSE'; Entry = 'LICENSE' }
)) {
    $taskRuntimeEntries += @{ SourcePath = (Join-Path $taskRoot $taskDoc.File); EntryName = $taskDoc.Entry }
}

# Explicit source roots keep local profiles, screenshots, Git metadata and extracted
# release copies outside the source archive, independently of Git's tracked state.
$taskSourceEntries = @()
foreach ($taskSourceName in @('.gitignore', 'LICENSE', 'README.md', 'INSTALL.md', 'PRIVACY.md', 'RELEASE-NOTES.md', 'package.json', 'extension', 'scripts', 'tests')) {
    $taskSourcePath = Join-Path $taskRoot $taskSourceName
    $taskSourceItem = Get-Item -LiteralPath $taskSourcePath
    $taskSourceFiles = if ($taskSourceItem.PSIsContainer) { @(Get-ChildItem -LiteralPath $taskSourcePath -Recurse -File) } else { @($taskSourceItem) }
    foreach ($taskFile in $taskSourceFiles) {
        $taskSourceEntries += @{ SourcePath = $taskFile.FullName; EntryName = $taskFile.FullName.Substring($taskRoot.Length + 1) }
    }
}

Write-ReleaseArchive -ArchivePath $taskRuntimeArchive -Entries $taskRuntimeEntries
Write-ReleaseArchive -ArchivePath $taskSourceArchive -Entries $taskSourceEntries
Copy-Item -LiteralPath $taskRuntimeArchive -Destination (Join-Path $taskRoot 'Twitch-English.zip') -Force
Copy-Item -LiteralPath $taskSourceArchive -Destination (Join-Path $taskRoot 'Twitch-English-GitHub.zip') -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'RELEASE-NOTES.md') -Destination (Join-Path $taskDist "RELEASE-NOTES-v$taskVersion.md") -Force

$taskChecksums = foreach ($taskArtifact in @($taskRuntimeArchive, $taskSourceArchive)) {
    $taskHasher = [System.Security.Cryptography.SHA256]::Create()
    $taskHashInput = [System.IO.File]::OpenRead($taskArtifact)
    try {
        $taskHash = [System.BitConverter]::ToString($taskHasher.ComputeHash($taskHashInput)).Replace('-', '').ToLowerInvariant()
    } finally {
        $taskHashInput.Dispose()
        $taskHasher.Dispose()
    }
    $taskHash + '  ' + [System.IO.Path]::GetFileName($taskArtifact)
}
[System.IO.File]::WriteAllText((Join-Path $taskDist 'SHA256SUMS.txt'), (($taskChecksums -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output "Release ready: $taskRuntimeArchive"
Write-Output "Source archive: $taskSourceArchive"
Write-Output "Checksums: $(Join-Path $taskDist 'SHA256SUMS.txt')"
