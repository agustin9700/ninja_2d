[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\attack\LIBRARY',
    [string]$DocumentXml = '..\source\animations\attack\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\attack_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'attack' -OwnerType 'attackAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson