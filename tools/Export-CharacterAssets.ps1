[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [ValidateRange(15, 600)]
    [int]$TimeoutSeconds = 120,
    [switch]$QuitAnimate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$exporterPath = Join-Path $ProjectRoot 'tools\adobe_animate\Ninja2D-Exporter.jsfl'
$artifactsDirectory = Join-Path $ProjectRoot 'artifacts'
$statusPath = Join-Path $artifactsDirectory 'character_asset_export_status.txt'
$tempScriptPath = Join-Path $artifactsDirectory 'run_character_asset_export.jsfl'

function ConvertTo-FileUri([string]$Path) {
    return ([Uri](Resolve-Path -LiteralPath $Path).Path).AbsoluteUri
}

$jobs = @(
    [ordered]@{ name='weapon_180'; document='source\assets\equipment\weapon_180\xfl\weapon_180.xfl'; output='source\assets\equipment\weapon_180\exports' },
    [ordered]@{ name='back_item_261'; document='source\assets\equipment\back_item_261\xfl\back_item_261.xfl'; output='source\assets\equipment\back_item_261\exports' },
    [ordered]@{ name='hair_91'; document='source\assets\equipment\hair_91\xfl\hair_91.xfl'; output='source\assets\equipment\hair_91\exports' },
    [ordered]@{ name='face_01_0'; document='source\assets\faces\face_01_0\xfl\face_01_0.xfl'; output='source\assets\faces\face_01_0\exports' },
    [ordered]@{ name='face_01_1'; document='source\assets\faces\face_01_1\xfl\face_01_1.xfl'; output='source\assets\faces\face_01_1\exports' },
    [ordered]@{ name='set_186_0'; document='source\assets\character_sets\set_186_0\set_186_0.fla'; output='source\assets\character_sets\set_186_0\exports' },
    [ordered]@{ name='weapon_182'; document='source\assets\equipment\weapon_182\wpn_182.fla'; output='source\assets\equipment\weapon_182\exports' },
    [ordered]@{ name='back_item_351'; document='source\assets\equipment\back_item_351\back_351.fla'; output='source\assets\equipment\back_item_351\exports' },
    [ordered]@{ name='hair_83_0'; document='source\assets\equipment\hair_83_0\hair_83_0.fla'; output='source\assets\equipment\hair_83_0\exports' }
)

if (-not (Test-Path -LiteralPath $exporterPath)) { throw "Missing exporter: $exporterPath" }
New-Item -ItemType Directory -Path $artifactsDirectory -Force | Out-Null
if (Test-Path -LiteralPath $statusPath) { Remove-Item -LiteralPath $statusPath }

$jobLines = foreach ($job in $jobs) {
    $documentPath = Join-Path $ProjectRoot $job.document
    $outputPath = Join-Path $ProjectRoot $job.output
    if (-not (Test-Path -LiteralPath $documentPath)) { throw "Missing XFL: $documentPath" }
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    '        {name: "' + $job.name + '", documentURI: "' + (ConvertTo-FileUri $documentPath) + '", outputURI: "' + ([Uri]$outputPath).AbsoluteUri + '"}'
}

$quitValue = if ($QuitAnimate) { 'true' } else { 'false' }
$jsfl = @"
(function () {
    var exporterURI = "$(ConvertTo-FileUri $exporterPath)";
    var statusURI = "$(([Uri]$statusPath).AbsoluteUri)";
    var quitWhenDone = $quitValue;
    var jobs = [
$($jobLines -join ",`n")
    ];
    var opened = null;
    var messages = [];
    try {
        if (FLfile.exists(statusURI)) FLfile.remove(statusURI);
        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            FLfile.createFolder(job.outputURI);
            opened = fl.openDocument(job.documentURI);
            if (!opened) throw new Error("Could not open " + job.documentURI);
            fl.ninja2DExportConfig = {quiet: true, outputName: job.name, outputFolderURI: job.outputURI};
            fl.runScript(exporterURI);
            if (!FLfile.exists(job.outputURI + "/asset_manifest.json")) throw new Error("Manifest was not generated for " + job.name);
            messages.push(job.name + ": OK");
            fl.closeDocument(opened, false);
            opened = null;
        }
        FLfile.write(statusURI, "OK\n" + messages.join("\n"));
    } catch (error) {
        try { if (opened) fl.closeDocument(opened, false); } catch (closeError) {}
        FLfile.write(statusURI, "ERROR\n" + String(error));
    } finally {
        fl.ninja2DExportConfig = null;
        if (quitWhenDone) {
            try { fl.quit(false); } catch (quitError) {}
        }
    }
})();
"@

$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($tempScriptPath, $jsfl, $utf8)
try {
    Start-Process -FilePath $tempScriptPath -WindowStyle Hidden | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $statusPath)) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path -LiteralPath $statusPath)) {
        throw "Adobe Animate did not finish within $TimeoutSeconds seconds."
    }
    $status = Get-Content -LiteralPath $statusPath
    $status | Write-Output
    if ($status[0] -ne 'OK') { throw 'Adobe Animate reported an export error.' }
} finally {
    if (Test-Path -LiteralPath $tempScriptPath) { Remove-Item -LiteralPath $tempScriptPath }
}
