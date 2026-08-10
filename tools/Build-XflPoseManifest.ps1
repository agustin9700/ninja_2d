param(
    [Parameter(Mandatory = $true)]
    [string]$XflDirectory,

    [Parameter(Mandatory = $true)]
    [string]$ExistingManifest,

    [Parameter(Mandatory = $true)]
    [string]$OutputManifest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$invariant = [System.Globalization.CultureInfo]::InvariantCulture
$documentPath = Join-Path $XflDirectory 'DOMDocument.xml'
$libraryPath = Join-Path $XflDirectory 'LIBRARY'

if (-not (Test-Path -LiteralPath $documentPath)) {
    throw "DOMDocument.xml not found: $documentPath"
}

if (-not (Test-Path -LiteralPath $ExistingManifest)) {
    throw "Existing manifest not found: $ExistingManifest"
}

function Get-XmlAttribute {
    param($Node, [string]$Name, $DefaultValue)
    $attribute = $Node.Attributes[$Name]
    if ($null -eq $attribute) { return $DefaultValue }
    return $attribute.Value
}

function Convert-ToNumber {
    param($Value, [double]$DefaultValue = 0)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $DefaultValue
    }

    $number = 0.0
    if ([double]::TryParse([string]$Value, [System.Globalization.NumberStyles]::Float, $invariant, [ref]$number)) {
        return $number
    }
    return $DefaultValue
}

function Convert-ToBoolean {
    param($Value, [bool]$DefaultValue = $true)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $DefaultValue
    }
    return ([string]$Value).ToLowerInvariant() -ne 'false'
}

function Set-ObjectProperty {
    param($Object, [string]$Name, $Value)
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

[xml]$documentXml = Get-Content -Raw -LiteralPath $documentPath
$namespace = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
$namespace.AddNamespace('x', 'http://ns.adobe.com/xfl/2008/')

$linkageByLibraryName = @{}
$symbolMetadata = @()

foreach ($include in $documentXml.SelectNodes('/x:DOMDocument/x:symbols/x:Include', $namespace)) {
    $symbolPath = Join-Path $libraryPath (Get-XmlAttribute $include 'href' '')
    if (-not (Test-Path -LiteralPath $symbolPath)) { continue }

    [xml]$symbolXml = Get-Content -Raw -LiteralPath $symbolPath
    $root = $symbolXml.DocumentElement
    $libraryName = [string](Get-XmlAttribute $root 'name' '')
    $linkageName = [string](Get-XmlAttribute $root 'linkageClassName' '')
    $itemType = [string](Get-XmlAttribute $root 'symbolType' 'movie clip')
    $linkageByLibraryName[$libraryName] = $linkageName
    $symbolMetadata += [ordered]@{
        libraryName = $libraryName
        itemType = $itemType
        linkageName = $linkageName
        timelineId = "library:$libraryName"
        sourceXml = [string](Get-XmlAttribute $include 'href' '')
    }
}

function Convert-XflTimeline {
    param(
        $TimelineNode,
        [string]$TimelineId,
        [string]$OwnerType,
        [string]$OwnerName,
        [double]$FrameRate
    )

    $layers = @()
    $layerNodes = @($TimelineNode.SelectNodes('./x:layers/x:DOMLayer', $namespace))
    $maximumFrame = 1

    for ($layerIndex = 0; $layerIndex -lt $layerNodes.Count; $layerIndex++) {
        $layerNode = $layerNodes[$layerIndex]
        $frames = @()

        foreach ($frameNode in $layerNode.SelectNodes('./x:frames/x:DOMFrame', $namespace)) {
            $frameIndex = [int](Convert-ToNumber (Get-XmlAttribute $frameNode 'index' 0))
            $duration = [int](Convert-ToNumber (Get-XmlAttribute $frameNode 'duration' 1) 1)
            if ($duration -lt 1) { $duration = 1 }
            $maximumFrame = [Math]::Max($maximumFrame, $frameIndex + $duration)
            $elements = @()
            $elementIndex = 0

            foreach ($elementNode in $frameNode.SelectNodes('./x:elements/*', $namespace)) {
                $matrixNode = $elementNode.SelectSingleNode('./x:matrix/x:Matrix', $namespace)
                $a = if ($null -eq $matrixNode) { 1.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'a' 1) 1 }
                $b = if ($null -eq $matrixNode) { 0.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'b' 0) }
                $c = if ($null -eq $matrixNode) { 0.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'c' 0) }
                $d = if ($null -eq $matrixNode) { 1.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'd' 1) 1 }
                $tx = if ($null -eq $matrixNode) { 0.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'tx' 0) }
                $ty = if ($null -eq $matrixNode) { 0.0 } else { Convert-ToNumber (Get-XmlAttribute $matrixNode 'ty' 0) }
                $scaleX = [Math]::Sqrt(($a * $a) + ($b * $b))
                $scaleY = if ($scaleX -eq 0) { 0.0 } else { (($a * $d) - ($b * $c)) / $scaleX }
                $rotation = [Math]::Atan2($b, $a) * 180 / [Math]::PI
                $libraryName = [string](Get-XmlAttribute $elementNode 'libraryItemName' '')
                $linkageName = if ($linkageByLibraryName.ContainsKey($libraryName)) { [string]$linkageByLibraryName[$libraryName] } else { '' }
                $pointNode = $elementNode.SelectSingleNode('./x:transformationPoint/x:Point', $namespace)
                $transformationPoint = $null

                if ($null -ne $pointNode) {
                    $transformationPoint = [ordered]@{
                        x = Convert-ToNumber (Get-XmlAttribute $pointNode 'x' 0)
                        y = Convert-ToNumber (Get-XmlAttribute $pointNode 'y' 0)
                        space = 'symbolLocal'
                    }
                }

                $elements += [ordered]@{
                    id = "$TimelineId/layer:$layerIndex/frame:$frameIndex/element:$elementIndex"
                    index = $elementIndex
                    elementType = $elementNode.LocalName
                    name = [string](Get-XmlAttribute $elementNode 'name' '')
                    libraryItemName = $libraryName
                    linkageName = $linkageName
                    matrixSpace = 'ownerTimeline'
                    matrix = [ordered]@{ a = $a; b = $b; c = $c; d = $d; tx = $tx; ty = $ty }
                    x = $tx
                    y = $ty
                    width = 0
                    height = 0
                    rotation = $rotation
                    scaleX = $scaleX
                    scaleY = $scaleY
                    skewX = 0
                    skewY = 0
                    symbolType = [string](Get-XmlAttribute $elementNode 'symbolType' '')
                    loop = [string](Get-XmlAttribute $elementNode 'loop' '')
                    firstFrame = Convert-ToNumber (Get-XmlAttribute $elementNode 'firstFrame' 0)
                    blendMode = [string](Get-XmlAttribute $elementNode 'blendMode' 'normal')
                    visible = Convert-ToBoolean (Get-XmlAttribute $elementNode 'visible' $true)
                    colorAlphaPercent = 100
                    transformationPoint = $transformationPoint
                }
                $elementIndex++
            }

            $frames += [ordered]@{
                index = $frameIndex
                duration = $duration
                name = [string](Get-XmlAttribute $frameNode 'name' '')
                labelType = [string](Get-XmlAttribute $frameNode 'labelType' '')
                tweenType = [string](Get-XmlAttribute $frameNode 'tweenType' 'none')
                tweenEasing = Convert-ToNumber (Get-XmlAttribute $frameNode 'acceleration' 0)
                actionScript = ''
                elements = $elements
            }
        }

        $parentLayerValue = Get-XmlAttribute $layerNode 'parentLayerIndex' $null
        $parentLayerIndex = if ($null -eq $parentLayerValue) { $null } else { [int](Convert-ToNumber $parentLayerValue) }
        $layers += [ordered]@{
            index = $layerIndex
            name = [string](Get-XmlAttribute $layerNode 'name' "Layer $($layerIndex + 1)")
            layerType = [string](Get-XmlAttribute $layerNode 'layerType' 'normal')
            parentLayerIndex = $parentLayerIndex
            visible = Convert-ToBoolean (Get-XmlAttribute $layerNode 'visible' $true)
            locked = Convert-ToBoolean (Get-XmlAttribute $layerNode 'locked' $false) $false
            outline = Convert-ToBoolean (Get-XmlAttribute $layerNode 'outline' $false) $false
            frames = $frames
        }
    }

    return [ordered]@{
        id = $TimelineId
        name = [string](Get-XmlAttribute $TimelineNode 'name' $OwnerName)
        ownerType = $OwnerType
        ownerName = $OwnerName
        frameRate = $FrameRate
        frameCount = $maximumFrame
        currentFrame = 0
        layerOrder = [ordered]@{
            arrayIndex0 = 'front'
            canvasRenderOrder = 'descendingLayerIndex'
        }
        layers = $layers
    }
}

$root = $documentXml.DocumentElement
$frameRate = Convert-ToNumber (Get-XmlAttribute $root 'frameRate' 24) 24
$documentTimelines = @()
$sceneIndex = 0

foreach ($timelineNode in $documentXml.SelectNodes('/x:DOMDocument/x:timelines/x:DOMTimeline', $namespace)) {
    $sceneName = [string](Get-XmlAttribute $timelineNode 'name' "Scene $($sceneIndex + 1)")
    $documentTimelines += Convert-XflTimeline $timelineNode "scene:$sceneIndex" 'document' $sceneName $frameRate
    $sceneIndex++
}

$symbolTimelines = @()
foreach ($include in $documentXml.SelectNodes('/x:DOMDocument/x:symbols/x:Include', $namespace)) {
    $symbolPath = Join-Path $libraryPath (Get-XmlAttribute $include 'href' '')
    if (-not (Test-Path -LiteralPath $symbolPath)) { continue }
    [xml]$symbolXml = Get-Content -Raw -LiteralPath $symbolPath
    $symbolRoot = $symbolXml.DocumentElement
    $symbolName = [string](Get-XmlAttribute $symbolRoot 'name' '')
    $timelineNode = $symbolRoot.SelectSingleNode('./x:timeline/x:DOMTimeline', $namespace)
    if ($null -ne $timelineNode) {
        $symbolTimelines += Convert-XflTimeline $timelineNode "library:$symbolName" 'librarySymbol' $symbolName $frameRate
    }
}

if ($documentTimelines.Count -eq 0) {
    throw 'The XFL contains no document timelines.'
}

$manifest = Get-Content -Raw -LiteralPath $ExistingManifest | ConvertFrom-Json
$rasterScale = Convert-ToNumber $manifest.raster.scaleFactor 1

foreach ($part in $manifest.parts) {
    Set-ObjectProperty $part 'rasterPixelsPerSourceUnit' $rasterScale
    Set-ObjectProperty $part 'registrationSource' ([ordered]@{ x = 0; y = 0 })
}

Set-ObjectProperty $manifest 'manifestVersion' '3.0'
Set-ObjectProperty $manifest 'generator' 'Ninja 2D Runtime Exporter v3 (XFL verification rebuild)'
Set-ObjectProperty $manifest 'source' ([ordered]@{
    document = [ordered]@{
        name = [string]$manifest.sourceDocument
        width = Convert-ToNumber (Get-XmlAttribute $root 'width' 0)
        height = Convert-ToNumber (Get-XmlAttribute $root 'height' 0)
        backgroundColor = [string](Get-XmlAttribute $root 'backgroundColor' '')
        frameRate = $frameRate
    }
    defaultTimelineId = 'scene:0'
    documentTimelines = $documentTimelines
    symbolTimelines = $symbolTimelines
})
Set-ObjectProperty $manifest 'coordinateSystem' ([ordered]@{
    sourceUnits = 'Animate document pixels at basePpi'
    xAxis = 'right'
    yAxis = 'down'
    angles = 'degrees clockwise in screen coordinates'
    matrixConvention = 'columnVector'
    matrixEquation = "x' = a*x + c*y + tx; y' = b*x + d*y + ty"
    rasterPixelsPerSourceUnit = $rasterScale
})
Set-ObjectProperty $manifest 'rendering' ([ordered]@{
    layerIndex0 = 'front'
    canvasLayerIteration = 'descending'
    authoritativeTransform = 'element.matrix'
    rasterCompensation = 'draw PNG at 1 / rasterPixelsPerSourceUnit in symbol-local space'
})
Set-ObjectProperty $manifest 'hierarchy' ([ordered]@{
    model = 'timeline-instance nesting'
    note = 'A symbol instance is parented by the timeline that owns it. No anatomical bone parent is inferred from layer names or proximity.'
})
Set-ObjectProperty $manifest 'symbols' $symbolMetadata
Set-ObjectProperty $manifest 'timeline' $documentTimelines[0]

$outputDirectory = Split-Path -Parent $OutputManifest
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$json = $manifest | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputManifest), $json, (New-Object System.Text.UTF8Encoding($false)))

$documentElementCount = 0
foreach ($layer in $documentTimelines[0].layers) {
    foreach ($frame in $layer.frames) {
        $documentElementCount += $frame.elements.Count
    }
}

Write-Output "Manifest written: $OutputManifest"
Write-Output "Document timelines: $($documentTimelines.Count)"
Write-Output "Symbol timelines: $($symbolTimelines.Count)"
Write-Output "Default pose layers: $($documentTimelines[0].layers.Count)"
Write-Output "Default pose elements: $documentElementCount"
