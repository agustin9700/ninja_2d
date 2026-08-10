[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\run\LIBRARY',
    [string]$DocumentXml = '..\source\animations\run\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\run_animation.json'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'run' -OwnerType 'runAnimation' -SymbolXml $SymboloXml -DocumentXml $DocumentXml -OutputJson $OutputJson
