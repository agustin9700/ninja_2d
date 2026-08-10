[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [ValidateSet('face_01_0', 'face_01_1')]
    [string]$FaceAssetId = 'face_01_0'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
Set-StrictMode -Version Latest
$utf8 = New-Object Text.UTF8Encoding($false)
$runtimeAssets = Join-Path $ProjectRoot 'prototype\assets'
$manifestPath = Join-Path $runtimeAssets 'asset_manifest.json'

function Read-Json([string]$Path) {
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Clone-Part($Part) {
    return ($Part | ConvertTo-Json -Depth 100 | ConvertFrom-Json)
}

function Find-Part($Manifest, [string]$LinkageName) {
    $part = @($Manifest.parts | Where-Object { $_.linkageName -eq $LinkageName -or $_.partName -eq $LinkageName }) | Select-Object -First 1
    if ($null -eq $part) { throw "No se encontró la pieza '$LinkageName' en $($Manifest.sourceDocument)" }
    return $part
}

$specs = @(
    [ordered]@{ assetId='weapon_180'; sourceDirectory='source\assets\equipment\weapon_180\exports'; sourceLinkage='weapon'; runtimeName='weapon'; png='weapon.png' },
    [ordered]@{ assetId='back_item_261'; sourceDirectory='source\assets\equipment\back_item_261\exports'; sourceLinkage='back_item'; runtimeName='back_item'; png='back_item.png' },
    [ordered]@{ assetId='hair_91'; sourceDirectory='source\assets\equipment\hair_91\exports'; sourceLinkage='hair'; runtimeName='hair'; png='hair.png'; correctRegistration=$true },
    [ordered]@{ assetId=$FaceAssetId; sourceDirectory=("source\assets\faces\{0}\exports" -f $FaceAssetId); sourceLinkage='face'; runtimeName='face'; png='face.png'; correctRegistration=$true }
)

$manifest = Read-Json $manifestPath
$newParts = @()
foreach ($spec in $specs) {
    $sourceDirectory = Join-Path $ProjectRoot $spec.sourceDirectory
    $sourceManifest = Read-Json (Join-Path $sourceDirectory 'asset_manifest.json')
    $sourcePart = Find-Part $sourceManifest $spec.sourceLinkage
    $part = Clone-Part $sourcePart
    $part.partName = $spec.runtimeName
    $part.linkageName = $spec.runtimeName
    $part.png = $spec.png
    $part | Add-Member -NotePropertyName sourceAssetId -NotePropertyValue $spec.assetId -Force
    $part | Add-Member -NotePropertyName sourceLinkageName -NotePropertyValue $spec.sourceLinkage -Force
    if ($spec.Contains('correctRegistration') -and $spec.correctRegistration) {
        $scale = [double]$part.scaleFactor
        $margin = [double]$part.margin
        $registrationX = [Math]::Round($margin - ([double]$part.boundsBeforeScale.left * $scale), 4)
        $registrationY = [Math]::Round($margin - ([double]$part.boundsBeforeScale.top * $scale), 4)
        $part.registrationPx = [ordered]@{ x=$registrationX; y=$registrationY }
        $part.pivot = [ordered]@{
            x=$registrationX
            y=$registrationY
            normalizedX=[Math]::Round($registrationX / [double]$part.exportWidth, 6)
            normalizedYTop=[Math]::Round($registrationY / [double]$part.exportHeight, 6)
            normalizedYUp=[Math]::Round(1 - ($registrationY / [double]$part.exportHeight), 6)
        }
    }
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $sourcePart.png) -Destination (Join-Path $runtimeAssets $spec.png) -Force
    $newParts += $part
}

$replacedNames = @($specs | ForEach-Object { $_.runtimeName })
$manifest.parts = @($manifest.parts | Where-Object { $_.partName -notin $replacedNames }) + $newParts
$manifest | Add-Member -NotePropertyName partAliases -NotePropertyValue ([ordered]@{ head='face' }) -Force
$manifest | Add-Member -NotePropertyName suppressedLinkages -NotePropertyValue @('back_hair') -Force
$manifest | Add-Member -NotePropertyName equipmentBindings -NotePropertyValue @(
    [ordered]@{
        partName='back_item'
        anchorPart='upper_body'
        drawOrder='behind_character'
        useTimelineInstanceWhenAvailable=$true
        localMatrix=[ordered]@{a=1;b=0;c=0;d=1;tx=0;ty=0}
    },
    [ordered]@{
        partName='weapon'
        anchorPart='left_hand'
        drawOrder='before_anchor'
        useTimelineInstanceWhenAvailable=$true
        localMatrix=[ordered]@{a=-0.337993866;b=-0.903796146;c=0.903796146;d=-0.337993866;tx=-42.539433;ty=22.477736}
    },
    [ordered]@{
        partName='hair'
        anchorPart='face'
        drawOrder='after_anchor'
        useTimelineInstanceWhenAvailable=$false
        localMatrix=[ordered]@{a=1;b=0;c=0;d=1;tx=0;ty=0}
    }
) -Force

$json = $manifest | ConvertTo-Json -Depth 100
[IO.File]::WriteAllText($manifestPath, $json, $utf8)
Write-Output "Character assets integrated into $manifestPath"
Write-Output "Parts: $($newParts.partName -join ', ')"