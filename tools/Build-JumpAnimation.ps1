[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\jump\LIBRARY',
    [string]$DocumentXml = '..\source\animations\jump\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\jump_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'jump' -OwnerType 'jumpAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson
