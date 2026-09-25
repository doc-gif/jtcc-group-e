param([Parameter(Mandatory)][string]$Version)
if ($Version -notmatch '^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Use vMAJOR.MINOR.PATCH, for example v0.1.0' }
. "$PSScriptRoot/github-request.ps1"
$headers = Get-GitHubHeaders
Invoke-RepositoryApi -Method POST -Path 'repos/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml/dispatches' -Headers $headers -Body @{ ref = 'main'; inputs = @{ version = $Version } } | Out-Null
Write-Output "Release $Version requested. Follow https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml until completion."
