[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\death\LIBRARY',
    [string]$DocumentXml = '..\source\animations\death\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\death_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'death' -OwnerType 'deathAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson