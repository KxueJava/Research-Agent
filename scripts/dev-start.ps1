<#
.SYNOPSIS
  一键启动 Research 全栈（research-tool 1601 / 后端 8101 / 前端 3001）。

.DESCRIPTION
  这个脚本存在的唯一理由：把"启动参数"从人的记忆里搬到代码里。

  当天实际踩过的坑：
    - 后端漏 --spring.profiles.active=prod → 落到 H2 内存库，登录正常但 /api/agent/** 全 500
    - CORS 白名单只放行 localhost → 用 127.0.0.1 访问时全站 Network Error
    - 改了 Java 没重建 jar → 改动静默失效
    - 服务挂在会被回收的后台任务上 → 进程莫名消失

  因此脚本固定做四件事：内置全部参数、启动前检查产物新鲜度、用独立进程启动、
  启动后读后端自检结果并打印。

.PARAMETER SkipBuild
  跳过 jar 新鲜度检查与构建（用于确认"当前产物就是我想跑的那个"）。

.PARAMETER SkipTool
  不启动 research-tool（只调前端/后端时用）。

.PARAMETER SkipFrontend
  不启动前端 dev server。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1
  powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1 -SkipBuild

.NOTES
  面向 Windows PowerShell 5.1（powershell.exe）。本文件必须保持 UTF-8 BOM：
  5.1 会按 ANSI 解析无 BOM 的 .ps1，中文注释会直接变成语法错误。
  未签名脚本受执行策略限制，所以用 -ExecutionPolicy Bypass 调用。
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipTool,
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------- 常量与路径

$ScriptDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $ScriptDir
$LogDir = Join-Path $ScriptDir "logs"
$PidFile = Join-Path $ScriptDir ".dev-pids.json"
$EnvFile = Join-Path $ScriptDir ".env.local"

# 端口是约定，不是参数：项目自身的默认值就是这三个。
# research-tool 的 1601 与 application-prod.yml 里所有 agent tool url 一致；
# 1602 是拆分部署下的 sandbox 角色端口，单进程运行不要用它。
$ToolPort = 1601
$BackendPort = 8101
$FrontendPort = 3001

$JarPath = Join-Path $RepoRoot "Research-agent-app\target\Research-agent-app.jar"
$ToolDir = Join-Path $RepoRoot "research-tool"
$UiDir = Join-Path $RepoRoot "ui"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---------------------------------------------------------------- 辅助函数

function Read-DotEnvFile {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    # 手工按 \r?\n 切分：Windows PowerShell 5.1 的 Get-Content 只认 CRLF，遇到 LF
    # 换行的 .env（跨平台提交很常见）会把整个文件当成一行，于是所有键都被开头那个
    # '#' 注释掉、静默读不到配置。不要退回 Get-Content 的逐行模式。
    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    foreach ($line in ($content -split "`r?`n")) {
        $text = $line.Trim()
        if (-not $text -or $text.StartsWith("#")) { continue }
        $index = $text.IndexOf("=")
        if ($index -lt 1) { continue }
        $key = $text.Substring(0, $index).Trim()
        $value = $text.Substring($index + 1).Trim().Trim('"')
        $map[$key] = $value
    }
    return $map
}

$LocalEnv = Read-DotEnvFile $EnvFile

# 优先级：环境变量 > scripts/.env.local > 默认值。绝不把凭证写死在脚本里。
function Resolve-Setting {
    param([string]$Name, [string]$Default = "")
    $fromProcess = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($fromProcess)) { return $fromProcess.Trim() }
    if ($LocalEnv.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($LocalEnv[$Name])) {
        return $LocalEnv[$Name]
    }
    return $Default
}

function Get-PortOwner {
    param([int]$Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Pid         = $conn.OwningProcess
        Name        = if ($proc) { $proc.Name } else { "" }
        CommandLine = if ($proc) { [string]$proc.CommandLine } else { "" }
    }
}

# 只清理"确实属于本项目"的占用者，避免误杀同名端口的无关服务。
function Stop-ProjectPort {
    param([int]$Port, [string]$Label)
    $owner = Get-PortOwner $Port
    if (-not $owner) { return }
    $looksLikeOurs = $owner.Name -in @("java.exe", "python.exe", "node.exe") -or
        $owner.CommandLine -match "Research-agent-app|research-tool|server\.py|vite"
    if (-not $looksLikeOurs) {
        throw "端口 $Port 被非本项目进程占用（$($owner.Name) PID=$($owner.Pid)），请手动处理后再启动。"
    }
    Write-Host "  释放 $Port（$Label，PID $($owner.Pid)）" -ForegroundColor DarkGray
    Stop-Process -Id $owner.Pid -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 15; $i++) {
        if (-not (Get-PortOwner $Port)) { return }
        Start-Sleep -Milliseconds 400
    }
}

function Wait-Http {
    param([string]$Url, [int]$TimeoutSeconds = 120)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            # 服务还没起来，继续等
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Wait-Port {
    param([int]$Port, [int]$TimeoutSeconds = 90)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-ProjectProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )
    $stdout = Join-Path $LogDir "$Name.log"
    $stderr = Join-Path $LogDir "$Name.err.log"
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -WindowStyle Hidden -PassThru
    Write-Host "  已启动 $Name (PID $($process.Id)) → $stdout" -ForegroundColor DarkGray
    return $process
}

function Test-RunnableJar {
    param([string]$Path)
    # 只看 mtime 不够：构建若在 spring-boot:repackage 阶段失败（Windows 上旧 JVM 锁住
    # jar 时会失败在重命名），会留下一个瘦 jar —— 它比源码新，但启动即报"没有主清单属性"。
    # 因此这里真去读 MANIFEST，要求同时具备 Main-Class 与 Spring Boot 的 Start-Class。
    if (-not (Test-Path $Path)) { return $false }
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
        try {
            $entry = $zip.Entries | Where-Object { $_.FullName -eq "META-INF/MANIFEST.MF" } | Select-Object -First 1
            if (-not $entry) { return $false }
            $reader = New-Object System.IO.StreamReader($entry.Open())
            try {
                $manifest = $reader.ReadToEnd()
            } finally {
                $reader.Dispose()
            }
            return ($manifest -match "Main-Class:") -and ($manifest -match "Start-Class:")
        } finally {
            $zip.Dispose()
        }
    } catch {
        return $false
    }
}

function Get-JarStaleSources {
    if (-not (Test-Path $JarPath)) { return @("jar 不存在") }
    if (-not (Test-RunnableJar $JarPath)) { return @("jar 不是可运行的 Spring Boot 包（构建可能中断过）") }
    $jarTime = (Get-Item $JarPath).LastWriteTime
    $stale = @()
    foreach ($module in (Get-ChildItem $RepoRoot -Directory -Filter "Research-agent-*" -ErrorAction SilentlyContinue)) {
        foreach ($relative in @("src\main\java", "src\main\resources")) {
            $root = Join-Path $module.FullName $relative
            if (-not (Test-Path $root)) { continue }
            $stale += Get-ChildItem $root -Recurse -File -Include *.java, *.xml, *.yml, *.sql -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt $jarTime }
        }
    }
    return $stale
}

# ---------------------------------------------------------------- 1. 凭证

Write-Host "`n=== 1/5 检查配置 ===" -ForegroundColor Cyan

$mysqlPassword = Resolve-Setting "RESEARCH_MYSQL_PASSWORD"
if ([string]::IsNullOrWhiteSpace($mysqlPassword)) {
    Write-Host @"
缺少 MySQL 密码，已停止启动。

  变量名 : RESEARCH_MYSQL_PASSWORD
  用途   : 连接 spring.datasource.mysql（application-prod.yml 刻意不存凭证）
  设置方式（任选其一）：
    - 写进 scripts/.env.local            : RESEARCH_MYSQL_PASSWORD=你的密码
    - 或设置环境变量                     : `$env:RESEARCH_MYSQL_PASSWORD = "你的密码"
"@ -ForegroundColor Yellow
    exit 1
}

$mysqlUser = Resolve-Setting "RESEARCH_MYSQL_USER" "root"

$jdkHome = Resolve-Setting "RESEARCH_JDK"
if ([string]::IsNullOrWhiteSpace($jdkHome)) {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        $jdkHome = $env:JAVA_HOME
    } elseif (Test-Path "D:\Java\JDK21\bin\java.exe") {
        $jdkHome = "D:\Java\JDK21"
    }
}
$javaExe = if ($jdkHome) { Join-Path $jdkHome "bin\java.exe" } else { $null }
if (-not $javaExe -or -not (Test-Path $javaExe)) {
    Write-Host "找不到 java.exe。请设置 RESEARCH_JDK 或 JAVA_HOME 指向 JDK 21。" -ForegroundColor Yellow
    exit 1
}
Write-Host "  JDK        : $jdkHome"
Write-Host "  MySQL 用户 : $mysqlUser（密码来自配置，不回显）"

# ---------------------------------------------------------------- 2. 清理占用

Write-Host "`n=== 2/5 清理旧进程 ===" -ForegroundColor Cyan
# 必须排在构建之前：Windows 上运行中的 JVM 会锁住 jar，先构建会以
# "Unable to rename ...jar to ...jar.original" 失败（repackage 阶段）。
if (-not $SkipTool) { Stop-ProjectPort $ToolPort "research-tool" }
Stop-ProjectPort $BackendPort "backend"
if (-not $SkipFrontend) { Stop-ProjectPort $FrontendPort "frontend" }

# ---------------------------------------------------------------- 3. 产物新鲜度

Write-Host "`n=== 3/5 检查并构建后端产物 ===" -ForegroundColor Cyan

if ($SkipBuild) {
    Write-Host "  已按 -SkipBuild 跳过构建检查" -ForegroundColor Yellow
} else {
    # 必须用 @() 包一层：PowerShell 会把单元素数组解包成标量，
    # 那时 $stale[0] 会变成字符串的第一个字符，下面的类型判断与 .Name 全部失效。
    $stale = @(Get-JarStaleSources)
    if ($stale.Count -gt 0) {
        if ($stale[0] -isnot [System.IO.FileInfo]) {
            Write-Host "  $($stale[0])，直接重建" -ForegroundColor Yellow
        } else {
            Write-Host "  发现 $($stale.Count) 个比 jar 新的后端源码，先重建（这能防止改动静默失效）" -ForegroundColor Yellow
            $stale | Select-Object -First 5 | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor DarkGray }
        }
        $buildLog = Join-Path $LogDir "maven-build.log"
        Push-Location $RepoRoot
        try {
            $env:JAVA_HOME = $jdkHome
            cmd /c "mvn -B -l `"$buildLog`" -pl Research-agent-app -am package -Dmaven.test.skip=true" | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  构建失败，详见 $buildLog" -ForegroundColor Red
                Get-Content $buildLog | Select-String -Pattern "ERROR" | Select-Object -First 10
                exit 1
            }
        } finally {
            Pop-Location
        }
        Write-Host "  重建完成" -ForegroundColor Green
    } else {
        Write-Host "  jar 已是最新" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------- 4. 启动

Write-Host "`n=== 4/5 启动服务 ===" -ForegroundColor Cyan

$started = [ordered]@{}

# A server-only credential is inherited by Java and Python, never put in URLs or logs.
$fileServiceToken = Resolve-Setting "RESEARCH_FILE_SERVICE_TOKEN"
if ([string]::IsNullOrWhiteSpace($fileServiceToken)) {
    $fileServiceToken = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    # Persist alongside existing ignored local secrets so -SkipTool does not rotate
    # one side of an active Java/Python pair to a different credential.
    [System.IO.File]::AppendAllText($EnvFile, "`nRESEARCH_FILE_SERVICE_TOKEN=$fileServiceToken`n")
}
$env:RESEARCH_FILE_SERVICE_TOKEN = $fileServiceToken
$env:RESEARCH_FILE_AUTH_BASE_URL = Resolve-Setting "RESEARCH_FILE_AUTH_BASE_URL" "http://127.0.0.1:$BackendPort"
$env:RESEARCH_FILE_ALLOWED_ORIGINS = Resolve-Setting "RESEARCH_FILE_ALLOWED_ORIGINS" "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"

# Stateful browser tools must be ready before the backend preloads enabled MCPs.
$browserMcpScript = Join-Path $ScriptDir "browser-mcp/start.ps1"
$browserMcpCli = Join-Path $ScriptDir "browser-mcp/node_modules/@playwright/mcp/cli.js"
if (Test-Path -LiteralPath $browserMcpCli) {
    & $browserMcpScript
}


if (-not $SkipTool) {
    $toolScript = Join-Path $ToolDir "start.ps1"
    if (-not (Test-Path $toolScript)) { throw "找不到 $toolScript" }
    # 复用项目自带的 research-tool/start.ps1：它已经处理了 .venv、ENV=prod、
    # FILE_SAVE_PATH/FILE_SERVER_URL 与端口占用检查，端口与本脚本一致（1601）。
    $started.Tool = (Start-ProjectProcess -Name "research-tool" `
            -FilePath (Get-Process -Id $PID).Path `
            -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $toolScript) `
            -WorkingDirectory $ToolDir).Id
}

$backendArgs = @(
    "-jar", $JarPath,
    "--spring.profiles.active=prod",
    "--spring.datasource.mysql.username=$mysqlUser",
    "--spring.datasource.mysql.password=$mysqlPassword",
    "--spring.datasource.query.username=$mysqlUser",
    "--spring.datasource.query.password=$mysqlPassword",
    "--autobots.execution.visitor-cookie.allowed-origins[0]=http://localhost:$FrontendPort",
    "--autobots.execution.visitor-cookie.allowed-origins[1]=http://127.0.0.1:$FrontendPort",
    "--autobots.execution.visitor-cookie.secure=false"
)

# OAuth secrets are inherited by Java through the environment, never command-line arguments.
foreach ($oauthSetting in @("RESEARCH_GITHUB_CLIENT_ID", "RESEARCH_GITHUB_CLIENT_SECRET", "RESEARCH_GITHUB_REDIRECT_URI", "AMAP_JS_KEY", "AMAP_WEB_KEY", "AMAP_SECURITY_JSCODE", "AMAP_SECURITY_SERVICE_HOST")) {
    $oauthValue = Resolve-Setting $oauthSetting
    if (-not [string]::IsNullOrWhiteSpace($oauthValue)) {
        [Environment]::SetEnvironmentVariable($oauthSetting, $oauthValue, "Process")
    }
}

$env:PUBLIC_ORIGIN = "http://localhost:$FrontendPort"
$env:WORKSPACE_ROOT = Join-Path $ToolDir "skilloutput"
$started.Backend = (Start-ProjectProcess -Name "backend" `
        -FilePath $javaExe -Arguments $backendArgs -WorkingDirectory $RepoRoot).Id

if (-not $SkipFrontend) {
    $started.Frontend = (Start-ProjectProcess -Name "ui" `
            -FilePath "cmd.exe" -Arguments @("/c", "corepack pnpm run dev") `
            -WorkingDirectory $UiDir).Id
}

$started | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8

# ---------------------------------------------------------------- 5. 等健康 + 自检

Write-Host "`n=== 5/5 等待就绪 ===" -ForegroundColor Cyan

$backendReady = Wait-Http "http://127.0.0.1:$BackendPort/web/health" 120
$frontendReady = if ($SkipFrontend) { $true } else { Wait-Http "http://127.0.0.1:$FrontendPort" 120 }
$toolReady = if ($SkipTool) { $true } else { Wait-Port $ToolPort 90 }

$selfCheck = $null
if ($backendReady) {
    try {
        $selfCheck = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/web/self-check" -TimeoutSec 10
    } catch {
        Write-Host "  读取自检结果失败: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

function Format-State([bool]$Ok) { if ($Ok) { "OK" } else { "失败" } }

Write-Host "`n================ 启动结果 ================" -ForegroundColor Cyan
Write-Host ("  {0,-15} {1,-6} {2}" -f "服务", "端口", "状态")
Write-Host ("  {0,-15} {1,-6} {2}" -f "research-tool", $ToolPort, (Format-State $toolReady))
Write-Host ("  {0,-15} {1,-6} {2}" -f "backend", $BackendPort, (Format-State $backendReady))
Write-Host ("  {0,-15} {1,-6} {2}" -f "frontend", $FrontendPort, (Format-State $frontendReady))

if ($selfCheck) {
    Write-Host ""
    Write-Host "  后端自检：" -ForegroundColor Cyan
    Write-Host "    profile   : $($selfCheck.profiles -join ', ')"
    Write-Host "    数据库    : $($selfCheck.datasourceProduct) / $($selfCheck.databaseName)"
    Write-Host "    运行产物  : $($selfCheck.artifactTime)"
    Write-Host "    表声明/缺失: $($selfCheck.declaredTableCount) / $($selfCheck.missingTables.Count)"
    if ($selfCheck.artifactStale) {
        Write-Host "    [警告] 产物早于源码: $($selfCheck.newestSource)" -ForegroundColor Yellow
    }
    foreach ($warning in $selfCheck.warnings) {
        Write-Host "    [警告] $warning" -ForegroundColor Yellow
    }
    if ($selfCheck.status -eq "ok") {
        Write-Host "    自检结论  : OK" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "  访问地址 : http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "  日志目录 : $LogDir"
Write-Host "  停止服务 : powershell -ExecutionPolicy Bypass -File scripts\dev-stop.ps1"
Write-Host "==========================================" -ForegroundColor Cyan

if (-not ($backendReady -and $frontendReady -and $toolReady)) {
    Write-Host "`n有服务未就绪，请检查上面列出的日志文件。" -ForegroundColor Red
    exit 1
}
