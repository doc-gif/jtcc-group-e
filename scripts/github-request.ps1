$ErrorActionPreference = 'Stop'

function Get-GitHubHeaders {
    $token = $env:GH_TOKEN
    if (-not $token) { $token = $env:GITHUB_TOKEN }
    if (-not $token) {
        $env:GIT_TERMINAL_PROMPT = '0'
        $env:GCM_INTERACTIVE = 'never'
        $lines = "protocol=https`nhost=github.com`n`n" | git credential fill
        if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication is required. Authenticate with Git Credential Manager or set GH_TOKEN.' }
        foreach ($line in $lines) { if ($line -match '^password=(.*)$') { $token = $Matches[1] } }
    }
    if (-not $token) { throw 'No GitHub token available' }
    return @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
}

function Invoke-RepositoryApi {
    param([string]$Method = 'GET', [string]$Path, $Body, [hashtable]$Headers)
    if ($Path -notmatch '^repos/doc-gif/jtcc-group-e(?:/|$)') { throw 'This helper is scoped to doc-gif/jtcc-group-e' }
    $arguments = @{ Method = $Method; Uri = "https://api.github.com/$Path"; Headers = $Headers }
    if ($null -ne $Body) { $arguments.Body = ConvertTo-Json -InputObject $Body -Depth 30; $arguments.ContentType = 'application/json' }
    Invoke-RestMethod @arguments
}
