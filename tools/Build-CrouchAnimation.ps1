[CmdletBinding()]
param(
    [Alias('SymbolXml')][string]$SymboloXml = '..\source\animations\crouch\LIBRARY',
    [string]$DocumentXml = '..\source\animations\crouch\DOMDocument.xml',
    [string]$OutputJson = '..\prototype\assets\crouch_animation.json'
)
$ErrorActionPreference = 'Stop'
$symbolInput = $SymboloXml
$symbolDirectory = Join-Path $PSScriptRoot $SymboloXml
if (Test-Path -LiteralPath $symbolDirectory -PathType Container) {
    $animationSymbol = Get-ChildItem -LiteralPath $symbolDirectory -Filter '*.xml' |
        Where-Object { $_.Name -like '*mbolo 2.xml' } |
        Select-Object -First 1
    if ($null -eq $animationSymbol) { throw ('Crouch animation symbol XML not found in: {0}' -f $symbolDirectory) }
    $symbolInput = $animationSymbol.FullName
}
& (Join-Path $PSScriptRoot 'Build-XflAnimation.ps1') -AnimationId 'crouch' -OwnerType 'crouchAnimation' -SymbolXml $symbolInput -DocumentXml $DocumentXml -OutputJson $OutputJson