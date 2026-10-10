<#
.SYNOPSIS
  停止 dev-start.ps1 启动的三个服务。

.DESCRIPTION
  按端口定位进程（而不是只按记录的 PID）：服务可能被重新拉起、也可能换过进程，
  端口是唯一稳定的定位依据。停止前会校验进程确实属于本项目，避免误杀占用同一端口的
  其他服务。
#>
[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$PidFile = Join-Path $ScriptDir ".dev-pids.json"

$targets = @(
    [pscustomobject]@{ Port = 1601; Label = "research-tool" },
    [pscustomobject]@{ Port = 8101; Label = "backend" },
    [pscustomobject]@{ Port = 3001; Label = "frontend" }
)

function Write-Line {
    param([string]$Text, [string]$Color = "Gray")
    if (-not $Quiet) { Write-Host $Text -ForegroundColor $Color }
}

Write-Line "`n=== 停止服务 ===" "Cyan"

foreach ($target in $targets) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) {
        Write-Line ("  {0,-15} {1,-6} 未运行" -f $target.Label, $target.Port) "DarkGray"
        continue
    }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.Name } else { "" }
    $commandLine = if ($proc) { [string]$proc.CommandLine } else { "" }

    $looksLikeOurs = $name -in @("java.exe", "python.exe", "node.exe") -or
        $commandLine -match "Research-agent-app|research-tool|server\.py|vite"
    if (-not $looksLikeOurs) {
        Write-Line ("  {0,-15} {1,-6} 跳过：被非本项目进程占用（{2} PID={3}）" -f `
                $target.Label, $target.Port, $name, $conn.OwningProcess) "Yellow"
        continue
    }

    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue

    $stopped = $false
    for ($i = 0; $i -lt 15; $i++) {
        if (-not (Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue)) {
            $stopped = $true
            break
        }
        Start-Sleep -Milliseconds 400
    }

    if ($stopped) {
        Write-Line ("  {0,-15} {1,-6} 已停止（PID {2}）" -f $target.Label, $target.Port, $conn.OwningProcess) "Green"
    } else {
        Write-Line ("  {0,-15} {1,-6} 停止失败（PID {2} 仍占用端口）" -f $target.Label, $target.Port, $conn.OwningProcess) "Red"
    }
}

if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

Write-Line "================`n" "Cyan"
