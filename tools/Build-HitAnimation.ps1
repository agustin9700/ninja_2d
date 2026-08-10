[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\hit\LIBRARY',
    [string]$DocumentXml = '..\source\animations\hit\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\hit_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'hit' -OwnerType 'hitAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson