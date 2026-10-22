[CmdletBinding()]
param([switch]$Headless)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cli = Join-Path $PSScriptRoot "node_modules/@playwright/mcp/cli.js"
$port = 8931
if (-not (Test-Path -LiteralPath $cli)) {
    throw "Browser MCP is not installed. Run: npm ci --prefix scripts/browser-mcp"
}
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($existing.Name -ne "node.exe" -or $existing.CommandLine -notlike "*$cli*") {
        throw "Port $port is occupied by another service; no process was stopped."
    }
    $runningHeadless = $existing.CommandLine -match '\s--headless(?:\s|$)'
    if ($runningHeadless -eq [bool]$Headless) {
        Write-Host "Browser MCP already running on $port (PID $($listener.OwningProcess), headless=$Headless)"
        return
    }
    # The process above has been verified to belong to this project.
    Stop-Process -Id $listener.OwningProcess -Force
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Browser MCP did not stop; mode change was not applied."
    }
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
$outputDir = Join-Path $repoRoot "runtime/browser-mcp"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$browserArgs = @(
    ('"' + $cli + '"'), "--host", "127.0.0.1", "--port", "$port",
    "--allowed-hosts", "127.0.0.1:8931,localhost:8931",
    "--browser", "chrome", "--isolated", "--block-service-workers",
    "--no-webmcp", "--codegen", "none", "--idle-timeout", "600000",
    "--timeout-navigation", "45000", "--output-max-size", "104857600",
    "--output-dir", ('"' + $outputDir + '"')
)
if ($Headless) { $browserArgs += "--headless" }
$process = Start-Process -FilePath $node -ArgumentList $browserArgs -WorkingDirectory $outputDir `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $outputDir "server.log") `
    -RedirectStandardError (Join-Path $outputDir "server-error.log") -PassThru
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($process.HasExited) { throw "Browser MCP exited; see runtime/browser-mcp/server-error.log" }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        Write-Host "Browser MCP started on http://127.0.0.1:$port/sse (PID $($process.Id), headless=$Headless)"
        return
    }
    Start-Sleep -Milliseconds 250
}
throw "Browser MCP startup timed out; see runtime/browser-mcp/server-error.log"
