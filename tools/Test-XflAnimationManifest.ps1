[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SymbolXml,
    [Parameter(Mandatory = $true)][string]$DocumentXml,
    [Parameter(Mandatory = $true)][string]$Manifest,
    [double]$Tolerance = 0.000001
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$invariant = [Globalization.CultureInfo]::InvariantCulture

function Get-XmlAttribute($Node, [string]$Name, $DefaultValue) {
    $attribute = $Node.Attributes[$Name]
    if ($null -eq $attribute) { return $DefaultValue }
    return $attribute.Value
}

function Convert-ToNumber($Value, [double]$DefaultValue = 0) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $DefaultValue }
    return [double]::Parse([string]$Value, [Globalization.NumberStyles]::Float, $invariant)
}

function Get-Matrix($Node, $Namespace) {
    $matrixNode = $Node.SelectSingleNode('./x:matrix/x:Matrix', $Namespace)
    if ($null -eq $matrixNode) { return @{a=1.0;b=0.0;c=0.0;d=1.0;tx=0.0;ty=0.0} }
    return @{
        a=Convert-ToNumber (Get-XmlAttribute $matrixNode 'a' 1) 1
        b=Convert-ToNumber (Get-XmlAttribute $matrixNode 'b' 0)
        c=Convert-ToNumber (Get-XmlAttribute $matrixNode 'c' 0)
        d=Convert-ToNumber (Get-XmlAttribute $matrixNode 'd' 1) 1
        tx=Convert-ToNumber (Get-XmlAttribute $matrixNode 'tx' 0)
        ty=Convert-ToNumber (Get-XmlAttribute $matrixNode 'ty' 0)
    }
}

foreach ($path in @($SymbolXml, $DocumentXml, $Manifest)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw ('File not found: {0}' -f $path) }
}

[xml]$symbol = Get-Content -Raw -Encoding UTF8 -LiteralPath $SymbolXml
[xml]$document = Get-Content -Raw -Encoding UTF8 -LiteralPath $DocumentXml
$data = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json
$namespace = New-Object Xml.XmlNamespaceManager($symbol.NameTable)
$namespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')
$documentNamespace = New-Object Xml.XmlNamespaceManager($document.NameTable)
$documentNamespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')
$timeline = $symbol.DocumentElement.SelectSingleNode('./x:timeline/x:DOMTimeline', $namespace)
$xmlLayers = @($timeline.SelectNodes('./x:layers/x:DOMLayer', $namespace))
$jsonLayers = @($data.layers)
if ($xmlLayers.Count -ne $jsonLayers.Count) { throw ('Layer count differs: XML={0}, JSON={1}' -f $xmlLayers.Count,$jsonLayers.Count) }

$maximumFrameEnd = 1
$maximumDelta = 0.0
$elementCount = 0
$matrixKeys = @('a','b','c','d','tx','ty')
for ($layerIndex=0; $layerIndex -lt $xmlLayers.Count; $layerIndex++) {
    $xmlFrames = @($xmlLayers[$layerIndex].SelectNodes('./x:frames/x:DOMFrame', $namespace))
    $jsonFrames = @($jsonLayers[$layerIndex].frames)
    if ($xmlFrames.Count -ne $jsonFrames.Count) { throw ('Frame count differs at layer {0}' -f $layerIndex) }
    for ($framePosition=0; $framePosition -lt $xmlFrames.Count; $framePosition++) {
        $xmlFrame = $xmlFrames[$framePosition]
        $jsonFrame = $jsonFrames[$framePosition]
        $frameIndex = [int](Convert-ToNumber (Get-XmlAttribute $xmlFrame 'index' 0))
        $duration = [int](Convert-ToNumber (Get-XmlAttribute $xmlFrame 'duration' 1) 1)
        if ($duration -lt 1) { $duration = 1 }
        $maximumFrameEnd = [Math]::Max($maximumFrameEnd, $frameIndex + $duration)
        if ($frameIndex -ne [int]$jsonFrame.index -or $duration -ne [int]$jsonFrame.duration) {
            throw ('Frame timing differs at layer {0}, frame {1}' -f $layerIndex,$framePosition)
        }
        $xmlElements = @($xmlFrame.SelectNodes('./x:elements/x:DOMSymbolInstance', $namespace))
        $jsonElements = @($jsonFrame.elements)
        if ($xmlElements.Count -ne $jsonElements.Count) { throw ('Element count differs at layer {0}, frame {1}' -f $layerIndex,$frameIndex) }
        for ($elementIndex=0; $elementIndex -lt $xmlElements.Count; $elementIndex++) {
            $xmlElement = $xmlElements[$elementIndex]
            $jsonElement = $jsonElements[$elementIndex]
            if ([string](Get-XmlAttribute $xmlElement 'name' '') -ne [string]$jsonElement.linkageName) { throw ('Linkage differs at layer {0}, frame {1}, element {2}' -f $layerIndex,$frameIndex,$elementIndex) }
            if ([string](Get-XmlAttribute $xmlElement 'libraryItemName' '') -ne [string]$jsonElement.libraryItemName) { throw ('Library item differs at layer {0}, frame {1}, element {2}' -f $layerIndex,$frameIndex,$elementIndex) }
            $xmlMatrix = Get-Matrix $xmlElement $namespace
            foreach ($key in $matrixKeys) {
                $delta = [Math]::Abs([double]$xmlMatrix[$key] - [double]$jsonElement.matrix.$key)
                $maximumDelta = [Math]::Max($maximumDelta, $delta)
                if ($delta -gt $Tolerance) { throw ('Matrix differs at layer {0}, frame {1}, element {2}, key {3}: {4}' -f $layerIndex,$frameIndex,$elementIndex,$key,$delta) }
            }
            $elementCount++
        }
    }
}

if ($maximumFrameEnd -ne [int]$data.frameCount) { throw ('Timeline duration differs: XML={0}, JSON={1}' -f $maximumFrameEnd,$data.frameCount) }

$symbolName = [string](Get-XmlAttribute $symbol.DocumentElement 'name' '')
$rootInstance = $null
foreach ($candidate in $document.SelectNodes('//x:DOMSymbolInstance', $documentNamespace)) {
    if ([string](Get-XmlAttribute $candidate 'libraryItemName' '') -eq $symbolName) { $rootInstance = $candidate; break }
}
if ($null -eq $rootInstance) { throw ('Root instance not found for symbol: {0}' -f $symbolName) }
$xmlRootMatrix = Get-Matrix $rootInstance $documentNamespace
foreach ($key in $matrixKeys) {
    $delta = [Math]::Abs([double]$xmlRootMatrix[$key] - [double]$data.rootMatrix.$key)
    $maximumDelta = [Math]::Max($maximumDelta, $delta)
    if ($delta -gt $Tolerance) { throw ('Root matrix differs at key {0}: {1}' -f $key,$delta) }
}

Write-Output 'Animation manifest validation: PASS'
Write-Output ('Animation: {0}' -f $data.id)
Write-Output ('Layers: {0}' -f $xmlLayers.Count)
Write-Output ('Frames: {0}' -f $maximumFrameEnd)
Write-Output ('Elements: {0}' -f $elementCount)
Write-Output ('Maximum matrix delta: {0}' -f $maximumDelta)
Write-Output ('Tolerance: {0}' -f $Tolerance)
