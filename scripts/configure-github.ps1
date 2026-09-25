param([switch]$Apply)
. "$PSScriptRoot/github-request.ps1"
$headers = Get-GitHubHeaders
$repoPath = 'repos/doc-gif/jtcc-group-e'
$repo = Invoke-RepositoryApi -Path $repoPath -Headers $headers
if (-not $repo.permissions.admin) { throw 'Repository admin permission is required' }
$protection = @{
    required_status_checks = @{ strict = $true; contexts = @('Quality gate', 'UI/UX gate') }
    enforce_admins = $true
    required_pull_request_reviews = @{ dismiss_stale_reviews = $true; required_approving_review_count = 1; require_code_owner_reviews = $false }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_conversation_resolution = $true
}
try {
    $existing = Invoke-RepositoryApi -Path "$repoPath/branches/main/protection" -Headers $headers
    if ($existing.required_pull_request_reviews.required_approving_review_count -gt 1 -or $existing.required_pull_request_reviews.require_code_owner_reviews -or $existing.required_pull_request_reviews.require_last_push_approval -or $existing.restrictions) {
        throw 'Existing protection is stricter than this baseline; review it manually instead of overwriting it'
    }
    $protection.required_status_checks.contexts = @(@($existing.required_status_checks.contexts) + @('Quality gate', 'UI/UX gate') | Select-Object -Unique)
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
}
if (-not $Apply) {
    Write-Output 'Planned settings: squash-only PR merges; required Quality gate; strict main; one approval; stale approvals dismissed; Actions approval enabled; Pages via Actions; immutable v* tags.'
    $protection | ConvertTo-Json -Depth 10
    exit 0
}
Invoke-RepositoryApi -Method PATCH -Path $repoPath -Headers $headers -Body @{ allow_squash_merge = $true; allow_merge_commit = $false; allow_rebase_merge = $false; delete_branch_on_merge = $true; allow_update_branch = $true } | Out-Null
Invoke-RepositoryApi -Method PUT -Path "$repoPath/actions/permissions/workflow" -Headers $headers -Body @{ default_workflow_permissions = 'read'; can_approve_pull_request_reviews = $true } | Out-Null
Invoke-RepositoryApi -Method PUT -Path "$repoPath/branches/main/protection" -Headers $headers -Body $protection | Out-Null
try {
    $null = Invoke-RepositoryApi -Path "$repoPath/pages" -Headers $headers
    Invoke-RepositoryApi -Method PUT -Path "$repoPath/pages" -Headers $headers -Body @{ build_type = 'workflow' } | Out-Null
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
    Invoke-RepositoryApi -Method POST -Path "$repoPath/pages" -Headers $headers -Body @{ build_type = 'workflow' } | Out-Null
}
Invoke-RepositoryApi -Method PUT -Path "$repoPath/environments/github-pages" -Headers $headers -Body @{ deployment_branch_policy = @{ protected_branches = $false; custom_branch_policies = $true } } | Out-Null
$policies = Invoke-RepositoryApi -Path "$repoPath/environments/github-pages/deployment-branch-policies" -Headers $headers
if (-not ($policies.branch_policies | Where-Object { $_.name -eq 'main' -and $_.type -eq 'branch' })) {
    Invoke-RepositoryApi -Method POST -Path "$repoPath/environments/github-pages/deployment-branch-policies" -Headers $headers -Body @{ name = 'main'; type = 'branch' } | Out-Null
}
$rules = @{ name = 'Immutable release tags'; target = 'tag'; enforcement = 'active'; conditions = @{ ref_name = @{ include = @('refs/tags/v*'); exclude = @() } }; rules = @(@{ type = 'update' }, @{ type = 'deletion' }); bypass_actors = @() }
$existingRule = Invoke-RepositoryApi -Path "$repoPath/rulesets" -Headers $headers | Where-Object { $_.name -eq $rules.name }
if ($existingRule) {
    Invoke-RepositoryApi -Method PUT -Path "$repoPath/rulesets/$($existingRule.id)" -Headers $headers -Body $rules | Out-Null
} else {
    Invoke-RepositoryApi -Method POST -Path "$repoPath/rulesets" -Headers $headers -Body $rules | Out-Null
}
Write-Output 'Repository settings applied. No deployment was started.'
