param(
    [Parameter(Mandatory = $true)]
    [string]$XflDirectory,

    [Parameter(Mandatory = $true)]
    [string]$Manifest,

    [double]$Tolerance = 0.000001
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$invariant = [System.Globalization.CultureInfo]::InvariantCulture

function Get-XmlAttribute {
    param($Node, [string]$Name, $DefaultValue)
    $attribute = $Node.Attributes[$Name]
    if ($null -eq $attribute) { return $DefaultValue }
    return $attribute.Value
}

function Convert-ToNumber {
    param($Value, [double]$DefaultValue = 0)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $DefaultValue }
    return [double]::Parse([string]$Value, [System.Globalization.NumberStyles]::Float, $invariant)
}

$documentPath = Join-Path $XflDirectory 'DOMDocument.xml'
[xml]$documentXml = Get-Content -Raw -LiteralPath $documentPath
$namespace = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
$namespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')
$manifestData = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
$manifestDirectory = Split-Path -Parent ([System.IO.Path]::GetFullPath($Manifest))
$xflLayers = @($documentXml.SelectNodes('/x:DOMDocument/x:timelines/x:DOMTimeline[1]/x:layers/x:DOMLayer', $namespace))
$manifestLayers = @($manifestData.timeline.layers)

if ($xflLayers.Count -ne $manifestLayers.Count) {
    throw "Layer count differs: XFL=$($xflLayers.Count), manifest=$($manifestLayers.Count)"
}

$partByName = @{}
foreach ($part in $manifestData.parts) {
    $partByName[[string]$part.partName] = $part
}

$maximumDelta = 0.0
$instanceCount = 0
$matrixKeys = @('a', 'b', 'c', 'd', 'tx', 'ty')

for ($layerIndex = 0; $layerIndex -lt $xflLayers.Count; $layerIndex++) {
    $xflElements = @($xflLayers[$layerIndex].SelectNodes('./x:frames/x:DOMFrame[1]/x:elements/x:DOMSymbolInstance', $namespace))
    $manifestElements = @($manifestLayers[$layerIndex].frames[0].elements)

    if ($xflElements.Count -ne $manifestElements.Count) {
        throw "Element count differs at layer ${layerIndex}: XFL=$($xflElements.Count), manifest=$($manifestElements.Count)"
    }

    for ($elementIndex = 0; $elementIndex -lt $xflElements.Count; $elementIndex++) {
        $xflElement = $xflElements[$elementIndex]
        $manifestElement = $manifestElements[$elementIndex]
        $xflLibraryName = [string](Get-XmlAttribute $xflElement 'libraryItemName' '')

        if ($xflLibraryName -ne [string]$manifestElement.libraryItemName) {
            throw "Library item differs at layer $layerIndex element ${elementIndex}: XFL=$xflLibraryName, manifest=$($manifestElement.libraryItemName)"
        }

        $matrixNode = $xflElement.SelectSingleNode('./x:matrix/x:Matrix', $namespace)
        $defaults = @{ a = 1.0; b = 0.0; c = 0.0; d = 1.0; tx = 0.0; ty = 0.0 }
        foreach ($key in $matrixKeys) {
            $xflValue = if ($null -eq $matrixNode) { $defaults[$key] } else { Convert-ToNumber (Get-XmlAttribute $matrixNode $key $defaults[$key]) $defaults[$key] }
            $manifestValue = [double]$manifestElement.matrix.$key
            $delta = [Math]::Abs($xflValue - $manifestValue)
            $maximumDelta = [Math]::Max($maximumDelta, $delta)
            if ($delta -gt $Tolerance) {
                throw "Matrix differs at layer $layerIndex element $elementIndex ($key): delta=$delta"
            }
        }

        $partName = [string]$manifestElement.linkageName
        if (-not $partByName.ContainsKey($partName)) {
            throw "Part metadata missing for linkage: $partName"
        }

        $pngPath = Join-Path $manifestDirectory ([string]$partByName[$partName].png)
        if (-not (Test-Path -LiteralPath $pngPath)) {
            throw "PNG missing for linkage $partName`: $pngPath"
        }
        $instanceCount++
    }
}

Write-Output 'Pose manifest validation: PASS'
Write-Output "Layers: $($xflLayers.Count)"
Write-Output "Instances: $instanceCount"
Write-Output "Maximum matrix delta: $maximumDelta"
Write-Output "Tolerance: $Tolerance"
