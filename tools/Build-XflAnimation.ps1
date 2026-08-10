[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9_-]*$')][string]$AnimationId,
    [Parameter(Mandatory = $true)][string]$SymbolXml,
    [string]$DocumentXml,
    [Parameter(Mandatory = $true)][string]$OutputJson,
    [string]$OwnerType = 'animation'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$invariant = [Globalization.CultureInfo]::InvariantCulture
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Resolve-InputPath([string]$Path) {
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $scriptDirectory $Path))
}

function Get-XmlAttribute($Node, [string]$Name, $DefaultValue) {
    $attribute = $Node.Attributes[$Name]
    if ($null -eq $attribute) { return $DefaultValue }
    return $attribute.Value
}

function Convert-ToNumber($Value, [double]$DefaultValue = 0) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $DefaultValue }
    $number = 0.0
    if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Float, $invariant, [ref]$number)) { return [Math]::Round($number, 6) }
    return $DefaultValue
}

function Convert-ToBoolean($Value, [bool]$DefaultValue = $true) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $DefaultValue }
    return ([string]$Value).ToLowerInvariant() -ne 'false'
}

function Convert-MatrixNode($MatrixNode) {
    if ($null -eq $MatrixNode) { return [ordered]@{ a=1.0;b=0.0;c=0.0;d=1.0;tx=0.0;ty=0.0 } }
    return [ordered]@{
        a=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'a' 1) 1
        b=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'b' 0)
        c=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'c' 0)
        d=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'd' 1) 1
        tx=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'tx' 0)
        ty=Convert-ToNumber (Get-XmlAttribute $MatrixNode 'ty' 0)
    }
}

$symbolInputPath = Resolve-InputPath $SymbolXml
if (Test-Path -LiteralPath $symbolInputPath -PathType Container) {
    $symbolFile = Get-ChildItem -LiteralPath $symbolInputPath -Filter '*.xml' | Where-Object { $_.Name -like '*mbolo 1.xml' } | Select-Object -First 1
    if ($null -eq $symbolFile) { throw ('Animation symbol XML not found in: {0}' -f $symbolInputPath) }
    $symbolPath = $symbolFile.FullName
} elseif (Test-Path -LiteralPath $symbolInputPath -PathType Leaf) {
    $symbolPath = $symbolInputPath
} else { throw ('Animation symbol path not found: {0}' -f $symbolInputPath) }

$outputPath = Resolve-InputPath $OutputJson
$documentPath = if ([string]::IsNullOrWhiteSpace($DocumentXml)) { $null } else { Resolve-InputPath $DocumentXml }
[xml]$symbolDocument = Get-Content -Raw -LiteralPath $symbolPath -Encoding UTF8
$namespace = New-Object Xml.XmlNamespaceManager($symbolDocument.NameTable)
$namespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')
$symbolRoot = $symbolDocument.DocumentElement
$symbolName = [string](Get-XmlAttribute $symbolRoot 'name' '')
$timelineNode = $symbolRoot.SelectSingleNode('./x:timeline/x:DOMTimeline', $namespace)
if ($null -eq $timelineNode) { throw ('DOMTimeline not found in: {0}' -f $symbolPath) }

$rootMatrix = [ordered]@{ a=1.0;b=0.0;c=0.0;d=1.0;tx=0.0;ty=0.0 }
$documentMetadata = $null
if ($documentPath -and (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    [xml]$document = Get-Content -Raw -LiteralPath $documentPath -Encoding UTF8
    $documentNamespace = New-Object Xml.XmlNamespaceManager($document.NameTable)
    $documentNamespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')
    $documentRoot = $document.DocumentElement
    foreach ($candidate in $document.SelectNodes('//x:DOMSymbolInstance', $documentNamespace)) {
        if ([string](Get-XmlAttribute $candidate 'libraryItemName' '') -eq $symbolName) {
            $rootMatrix = Convert-MatrixNode $candidate.SelectSingleNode('./x:matrix/x:Matrix', $documentNamespace)
            break
        }
    }
    $documentMetadata = [ordered]@{
        path=[IO.Path]::GetFileName($documentPath)
        width=Convert-ToNumber (Get-XmlAttribute $documentRoot 'width' 0)
        height=Convert-ToNumber (Get-XmlAttribute $documentRoot 'height' 0)
        frameRate=Convert-ToNumber (Get-XmlAttribute $documentRoot 'frameRate' 30) 30
    }
}

$layers = @()
$maximumFrameEnd = 1
$layerNodes = @($timelineNode.SelectNodes('./x:layers/x:DOMLayer', $namespace))
for ($layerIndex=0; $layerIndex -lt $layerNodes.Count; $layerIndex++) {
    $layerNode = $layerNodes[$layerIndex]
    $frames = @()
    foreach ($frameNode in $layerNode.SelectNodes('./x:frames/x:DOMFrame', $namespace)) {
        $frameIndex = [int](Convert-ToNumber (Get-XmlAttribute $frameNode 'index' 0))
        $duration = [int](Convert-ToNumber (Get-XmlAttribute $frameNode 'duration' 1) 1)
        if ($duration -lt 1) { $duration = 1 }
        $maximumFrameEnd = [Math]::Max($maximumFrameEnd, $frameIndex + $duration)
        $elements = @()
        $elementIndex = 0
        foreach ($elementNode in $frameNode.SelectNodes('./x:elements/x:DOMSymbolInstance', $namespace)) {
            $instanceName = [string](Get-XmlAttribute $elementNode 'name' '')
            $elements += [ordered]@{
                id=('{0}/layer:{1}/frame:{2}/element:{3}' -f $AnimationId,$layerIndex,$frameIndex,$elementIndex)
                index=$elementIndex
                elementType='DOMSymbolInstance'
                name=$instanceName
                libraryItemName=[string](Get-XmlAttribute $elementNode 'libraryItemName' '')
                linkageName=$instanceName
                matrixSpace='symbolLocal'
                matrix=Convert-MatrixNode $elementNode.SelectSingleNode('./x:matrix/x:Matrix', $namespace)
                colorAlphaPercent=100
                visible=Convert-ToBoolean (Get-XmlAttribute $elementNode 'visible' $true)
            }
            $elementIndex++
        }
        $frames += [ordered]@{ index=$frameIndex;duration=$duration;elements=$elements }
    }
    $parentValue = Get-XmlAttribute $layerNode 'parentLayerIndex' $null
    $layers += [ordered]@{
        index=$layerIndex
        name=[string](Get-XmlAttribute $layerNode 'name' ('Layer {0}' -f ($layerIndex + 1)))
        layerType=[string](Get-XmlAttribute $layerNode 'layerType' 'normal')
        parentLayerIndex=if ($null -eq $parentValue) { $null } else { [int](Convert-ToNumber $parentValue) }
        visible=Convert-ToBoolean (Get-XmlAttribute $layerNode 'visible' $true)
        locked=Convert-ToBoolean (Get-XmlAttribute $layerNode 'locked' $false) $false
        frames=$frames
    }
}

$dependencies = @($layers | ForEach-Object { $_.frames } | ForEach-Object { $_.elements } |
    ForEach-Object { [string]$_.linkageName } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
$unnamedInstances = @($layers | ForEach-Object { $_.frames } | ForEach-Object { $_.elements } |
    Where-Object { [string]::IsNullOrWhiteSpace([string]$_.linkageName) }).Count
$frameRate = if ($null -ne $documentMetadata) { $documentMetadata.frameRate } else { 30 }
$output = [ordered]@{
    manifestVersion='1.0';id=$AnimationId;name=[string](Get-XmlAttribute $timelineNode 'name' $symbolName)
    ownerType=$OwnerType;frameCount=$maximumFrameEnd;frameRate=$frameRate;coordinateSpace='symbolLocal'
    rootMatrix=$rootMatrix
    alignment=[ordered]@{mode='firstFrameBottomCenter';target='baseTimelineFirstFrame'}
    source=[ordered]@{symbol=[IO.Path]::GetFileName($symbolPath);document=$documentMetadata}
    layerOrder=[ordered]@{arrayIndex0='front';canvasRenderOrder='descendingLayerIndex'}
    dependencies=$dependencies
    stats=[ordered]@{layers=$layers.Count;frames=$maximumFrameEnd;unnamedInstances=$unnamedInstances}
    layers=$layers
}
$outputDirectory = Split-Path -Parent $outputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory | Out-Null }
$json = $output | ConvertTo-Json -Depth 40
[IO.File]::WriteAllText($outputPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Output ('Animation manifest written: {0}' -f $outputPath)
Write-Output ('Animation: {0}' -f $AnimationId)
Write-Output ('Frames: {0}' -f $maximumFrameEnd)
Write-Output ('Layers: {0}' -f $layers.Count)
Write-Output ('Unnamed instances: {0}' -f $unnamedInstances)
Write-Output ('Root matrix: [{0}, {1}, {2}, {3}, {4}, {5}]' -f $rootMatrix.a,$rootMatrix.b,$rootMatrix.c,$rootMatrix.d,$rootMatrix.tx,$rootMatrix.ty)
