<# Runs only this feature's tests without compiling unrelated existing application tests. #>
[CmdletBinding()]
param([switch]$ParserOnly)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $repoRoot 'Research-agent-app\target\suggested-prompts-tests'
$libRoot = Join-Path $testRoot 'lib'
$classesRoot = Join-Path $testRoot 'classes'
New-Item -ItemType Directory -Force -Path $libRoot, $classesRoot | Out-Null
$jarPath = Join-Path $repoRoot 'Research-agent-app\target\Research-agent-app.jar'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($jarPath)
try {
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '^BOOT-INF/lib/[^/]+\.jar$') {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $libRoot $entry.Name), $true)
        }
    }
} finally { $zip.Dispose() }
$mavenRepo = Join-Path $env:USERPROFILE '.m2\repository'
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
if ($mavenCommand) {
    $mavenRoot = Split-Path -Parent (Split-Path -Parent $mavenCommand.Source)
    $settingsPath = Join-Path $mavenRoot 'conf\settings.xml'
    if (Test-Path $settingsPath) {
        [xml]$settings = Get-Content $settingsPath -Raw
        if ($settings.settings.localRepository) { $mavenRepo = [string]$settings.settings.localRepository }
    }
}
$cacheRoots = @($mavenRepo, (Join-Path $env:USERPROFILE '.m2\repository'))
$junitJar = $cacheRoots | ForEach-Object { Join-Path $_ 'junit\junit\4.12\junit-4.12.jar' } | Where-Object { Test-Path $_ } | Select-Object -First 1
$hamcrestJar = $cacheRoots | ForEach-Object { Join-Path $_ 'org\hamcrest\hamcrest\2.2\hamcrest-2.2.jar' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $junitJar -or -not $hamcrestJar) { throw 'JUnit/Hamcrest is missing from the local Maven caches' }
$moduleClasses = @('domain','case','infrastructure','trigger','app') | ForEach-Object { Join-Path $repoRoot "Research-agent-$_\target\classes" }
$classpath = (@($classesRoot, "$libRoot\*", $junitJar, $hamcrestJar) + $moduleClasses) -join ';'
$sources = @(
    (Join-Path $repoRoot 'Research-agent-domain\src\main\java\org\wwz\ai\domain\agent\suggestion\SuggestedPrompt.java'),
    (Join-Path $repoRoot 'Research-agent-domain\src\main\java\org\wwz\ai\domain\agent\suggestion\SuggestedPromptBatch.java'),
    (Join-Path $repoRoot 'Research-agent-app\src\test\java\org\wwz\ai\test\domain\SuggestedPromptTest.java')
)
$tests = @('org.wwz.ai.test.domain.SuggestedPromptTest')
if (-not $ParserOnly) {
    $sources += Join-Path $repoRoot 'Research-agent-app\src\test\java\org\wwz\ai\test\domain\SuggestedPromptServiceTest.java'
    $tests += 'org.wwz.ai.test.domain.SuggestedPromptServiceTest'
}
$jdkRoot = if ($env:RESEARCH_JDK) { $env:RESEARCH_JDK } elseif ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'D:\Java\JDK21' }
& (Join-Path $jdkRoot 'bin\javac.exe') -encoding UTF-8 -proc:none -cp $classpath -d $classesRoot @sources
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $jdkRoot 'bin\java.exe') -cp $classpath org.junit.runner.JUnitCore @tests
exit $LASTEXITCODE
