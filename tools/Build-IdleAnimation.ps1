[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\idle\LIBRARY',
    [string]$DocumentXml = '..\source\animations\idle\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\idle_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'idle' -OwnerType 'idleAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson
