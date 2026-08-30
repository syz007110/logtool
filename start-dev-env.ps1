$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$redisDir = Join-Path $repoRoot 'infrastructure\Redis'
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$redisExe = Join-Path $redisDir 'redis-server.exe'
$redisConf = Join-Path $redisDir 'redis.conf'
$backendEnv = Join-Path $backendDir '.env'

function Test-RequiredPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description not found: $Path"
    }
}

function Start-CmdWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $quotedDirectory = '"' + $WorkingDirectory + '"'
    $cmdLine = "title $Title && cd /d $quotedDirectory && $Command"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $cmdLine -WorkingDirectory $WorkingDirectory
}

function New-WtCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    return "new-tab --title `"$Title`" -d `"$WorkingDirectory`" cmd /k `"$Command`""
}

function Split-WtCommand {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('H', 'V')]
        [string]$Direction,
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $directionFlag = if ($Direction -eq 'H') { '-H' } else { '-V' }
    return "split-pane $directionFlag --title `"$Title`" -d `"$WorkingDirectory`" cmd /k `"$Command`""
}

Write-Host '========================================'
Write-Host ' LogTool Windows Dev Environment Starter'
Write-Host '========================================'
Write-Host ''

Test-RequiredPath -Path $redisDir -Description 'Redis directory'
Test-RequiredPath -Path $backendDir -Description 'Backend directory'
Test-RequiredPath -Path $frontendDir -Description 'Frontend directory'
Test-RequiredPath -Path $redisExe -Description 'Redis server executable'
Test-RequiredPath -Path $redisConf -Description 'Redis config file'

if (-not (Test-Path -LiteralPath $backendEnv)) {
    Write-Warning "Backend .env file not found: $backendEnv"
    Write-Warning 'Backend may fail to start until the environment file is created.'
}

if (-not (Test-Path -LiteralPath (Join-Path $backendDir 'node_modules'))) {
    Write-Warning 'backend\node_modules not found. Run npm install in backend if startup fails.'
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules'))) {
    Write-Warning 'frontend\node_modules not found. Run npm install in frontend if startup fails.'
}

$wtCommand = Get-Command wt.exe -ErrorAction SilentlyContinue
$redisProcess = Get-Process -Name 'redis-server' -ErrorAction SilentlyContinue
$useWt = $null -ne $wtCommand

if ($useWt) {
    $wtSegments = @()

    if ($redisProcess) {
        Write-Host 'Redis is already running. The pane layout will include backend and frontend only.'
    } else {
        $wtSegments += New-WtCommand -Title 'LogTool Redis' -WorkingDirectory $redisDir -Command '.\redis-server.exe .\redis.conf'
    }

    $backendPaneDirection = if ($wtSegments.Count -eq 0) { 'V' } else { 'H' }
    if ($wtSegments.Count -eq 0) {
        $wtSegments += New-WtCommand -Title 'LogTool Backend Cluster' -WorkingDirectory $backendDir -Command 'npm run cluster'
    } else {
        $wtSegments += Split-WtCommand -Direction $backendPaneDirection -Title 'LogTool Backend Cluster' -WorkingDirectory $backendDir -Command 'npm run cluster'
    }

    $wtSegments += Split-WtCommand -Direction 'V' -Title 'LogTool Frontend Dev' -WorkingDirectory $frontendDir -Command 'npm run dev'

    Start-Process -FilePath $wtCommand.Source -ArgumentList ($wtSegments -join ' ; ')
    Write-Host 'Started development services in one Windows Terminal window with panes.'
} else {
    if ($redisProcess) {
        Write-Host 'Redis is already running. Skipping Redis startup window.'
    } else {
        Start-CmdWindow -Title 'LogTool Redis' -WorkingDirectory $redisDir -Command '.\redis-server.exe .\redis.conf'
        Start-Sleep -Seconds 2
    }

    Start-CmdWindow -Title 'LogTool Backend Cluster' -WorkingDirectory $backendDir -Command 'npm run cluster'
    Start-Sleep -Seconds 2
    Start-CmdWindow -Title 'LogTool Frontend Dev' -WorkingDirectory $frontendDir -Command 'npm run dev'
    Write-Host 'Windows Terminal was not found. Started services in separate terminal windows.'
}

Write-Host 'Redis: infrastructure\Redis\redis-server.exe redis.conf'
Write-Host 'Backend: npm run cluster'
Write-Host 'Frontend: npm run dev'
