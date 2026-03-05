# Usage:
#   .\deploy\finish-branch.ps1
#   .\deploy\finish-branch.ps1 -NoDeleteRemote  # only delete local branch
#   .\deploy\finish-branch.ps1 -Force           # force local delete with -D

param(
    [switch]$NoDeleteRemote,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$remote = if ($env:GIT_REMOTE) { $env:GIT_REMOTE } else { "origin" }
$mainBranch = if ($env:MAIN_BRANCH) { $env:MAIN_BRANCH } else { "main" }

function Log { param($msg) Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg" }
function Die { param($msg) Write-Error "ERROR: $msg"; exit 1 }

$current = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $current) { Die "Not a git repository" }
if ($current -eq "main" -or $current -eq "master") {
    Die "Current branch is $current. Switch to your feature branch first."
}

$status = git status --porcelain 2>$null
if ($status) { Die "Working tree has uncommitted changes. Commit or stash first." }

Log "Pushing branch: $current"
git push -u $remote $current
if ($LASTEXITCODE -ne 0) { Die "git push failed" }

Log "Checking out $mainBranch and pulling latest"
git checkout $mainBranch
if ($LASTEXITCODE -ne 0) { Die "git checkout failed" }
git pull $remote $mainBranch
if ($LASTEXITCODE -ne 0) { Die "git pull failed" }

if (-not $NoDeleteRemote) {
    Log "Deleting remote branch: $current"
    git push $remote --delete $current
    if ($LASTEXITCODE -ne 0) { Die "git push --delete failed" }
}

Log "Deleting local branch: $current"
if ($Force) {
    git branch -D $current
} else {
    git branch -d $current
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Hint: current branch is not merged into $mainBranch." -ForegroundColor Yellow
    Write-Host "Please merge it in your remote repository (GitHub/GitLab) first, then run this script again." -ForegroundColor Yellow
    Write-Host "If you are sure this branch can be removed, use -Force:" -ForegroundColor Cyan
    Write-Host "  .\deploy\finish-branch.ps1 -Force" -ForegroundColor Cyan
    Write-Host ""
    Die "git branch -d failed (branch not fully merged)"
}

Log ('Done. You are on ' + $mainBranch + ', branch ' + $current + ' has been removed.')
