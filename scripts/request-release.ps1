param([string]$Version = '')
# 版を省くと、公開の workflow が最新のタグの patch + 1 を決める（docs/DEPLOYMENT.md「公開のキュー」）
if ($Version -and $Version -notmatch '^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Use vMAJOR.MINOR.PATCH, for example v0.1.0' }
. "$PSScriptRoot/github-request.ps1"
$headers = Get-GitHubHeaders
Invoke-RepositoryApi -Method POST -Path 'repos/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml/dispatches' -Headers $headers -Body @{ ref = 'main'; inputs = @{ version = $Version } } | Out-Null
Write-Output "Release $(if ($Version) { $Version } else { '(next patch)' }) of current main requested. Follow https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml until completion."
