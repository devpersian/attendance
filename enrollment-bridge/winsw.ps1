# winsw.ps1 - download WinSW AND the bridge's npm dependencies next to this
# script, then register Spersia Enrollment Bridge as a TRUE Windows service
# (visible in services.msc, auto-start at boot).
# Because everything is installed beside the script (in its own folder), you
# can deploy/copy that whole folder to another machine and re-run without
# downloading anything again.
# Run from an elevated PowerShell, or just double-click install-service.cmd.

$ErrorActionPreference = 'Stop'

$ServiceName = if ($env:BRIDGE_SERVICE_NAME) { $env:BRIDGE_SERVICE_NAME } else { 'SpersiaEnrollmentBridge' }
$DisplayName = 'Spersia Enrollment Bridge'
$Description = 'Local bridge that lets the Spersia web app capture fingerprints/cards via vendor SDKs and USB readers.'
$Port        = if ($env:BRIDGE_PORT) { $env:BRIDGE_PORT } else { '8485' }

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Dir) { $Dir = (Get-Location).Path }
$ExePath = Join-Path $Dir ($ServiceName + '.exe')
$XmlPath = Join-Path $Dir ($ServiceName + '.xml')
$LogDir  = Join-Path $Dir 'logs'

$NodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) { throw 'node.exe not found on PATH. Install Node.js first.' }
$MainJs = Join-Path $Dir 'main.js'
if (-not (Test-Path $MainJs)) { throw ('main.js not found next to this script: ' + $MainJs) }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# --- 1. Download WinSW if the exe is missing --------------------------------
if (-not (Test-Path $ExePath)) {
    Write-Host 'Downloading WinSW ...'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    $urls = @(
        'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
        'https://github.com/winsw/winsw/releases/download/v2.11.0/WinSW-x64.exe',
        'https://github.com/winsw/winsw/releases/download/v2.10.0/WinSW-x64.exe'
    )
    $ok = $false
    foreach ($u in $urls) {
        try {
            Invoke-WebRequest -Uri $u -OutFile $ExePath -UseBasicParsing -TimeoutSec 120
            $ok = $true; break
        } catch { Write-Host ('  failed: ' + $_.Exception.Message) }
    }
    if (-not $ok) {
        throw 'Could not download WinSW automatically. Download WinSW-x64.exe from https://github.com/winsw/winsw/releases manually, save it as ' + $ExePath + ' and re-run.'
    }
    Unblock-File -Path $ExePath -ErrorAction SilentlyContinue
} else {
    Write-Host ('WinSW already present: ' + $ExePath)
}

# --- 1b. Install npm requirements into node_modules BESIDE this script -------
# The service runs main.js with plain node.exe, so its dependencies must live
# in <script folder>\node_modules. We only download them if they are missing,
# so once deployed the folder is self-contained and nothing is fetched again.
$NodeModulesDir = Join-Path $Dir 'node_modules'
$PkgJson        = Join-Path $Dir 'package.json'
if (-not (Test-Path $NodeModulesDir)) {
    if (-not (Test-Path $PkgJson)) {
        throw ('package.json not found next to this script: ' + $PkgJson)
    }
    $NpmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $NpmCmd) { throw 'npm.cmd not found on PATH. Install Node.js first.' }
    Write-Host 'Downloading requirements (npm ci --omit=dev) into ' $NodeModulesDir ' ...'
    Push-Location $Dir
    try {
        & $NpmCmd.Source ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            # fall back for projects without a lockfile / older npm
            & $NpmCmd.Source install --omit=dev --no-audit --no-fund
        }
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) {
        throw ('Installing requirements failed with exit code ' + $LASTEXITCODE +
               '. Check your network connection and re-run.')
    }
    Write-Host 'Requirements installed beside the script; future runs will NOT download again.'
} else {
    Write-Host ('Requirements already present: ' + $NodeModulesDir + ' (skipping download)')
}

# --- 1c. Check vendor SDK DLLs beside this script ----------------------------
# The bridge drives biometric devices through *.sdk.json manifests in .\sdk.
# The DLL binaries themselves are NOT in this repository (vendor EULAs /
# support-login downloads - see enrollment-bridge\README.md), so they cannot
# be downloaded automatically here. This step only reports which ones are
# missing and where to drop them; once copied in, they live beside the
# script and travel with the deployed folder - nothing is re-downloaded.
$SdkDir = Join-Path $Dir 'sdk'
Write-Host ''
Write-Host 'Checking vendor SDK DLLs in' $SdkDir '...'
if (Test-Path $SdkDir) {
    $missingAny = $false
    foreach ($mf in (Get-ChildItem -Path $SdkDir -Filter '*.sdk.json' -ErrorAction SilentlyContinue)) {
        try {
            $manifest = Get-Content -Raw -Path $mf.FullName | ConvertFrom-Json
        } catch {
            Write-Warning ('Could not parse manifest: ' + $mf.Name)
            continue
        }
        $id = if ($manifest.id) { $manifest.id } else { $mf.Name }
        $dllNames = @($manifest.dlls)
        $found = @($dllNames | Where-Object { Test-Path -Path (Join-Path $SdkDir $_) })
        if ($found.Count -gt 0) {
            Write-Host ('  [OK]      ' + $id + ' -> ' + ($found -join ', '))
        } else {
            $missingAny = $true
            Write-Host ('  [MISSING] ' + $id + ' -> need one of: ' + ($dllNames -join ', '))
            Write-Host              ('            Obtain the SDK from the vendor (_source link in ' + $mf.Name + ')')
            Write-Host              ('            and copy the DLL into ' + $SdkDir + '\')
        }
    }
    if ($missingAny) {
        Write-Host ''
        Write-Host 'The service will still install; providers without their DLL show as "missing_dll"'
        Write-Host ('in GET /sdk/providers. After copying a DLL in, press the "بازجستجو" button in the')
        Write-Host ('web app (or POST http://127.0.0.1:' + $Port + '/sdk/rescan) to pick it up without restarting.')
    }
} else {
    Write-Warning ('SDK folder not found: ' + $SdkDir + ' - skipping DLL check.')
}
Write-Host ''

# --- 2. Generate the service XML (built with concatenation to avoid any
#        here-string / quoting pitfalls under different PowerShell versions) ---
$lines = @(
    '<service>',
    ('  <id>' + $ServiceName + '</id>'),
    ('  <name>' + $DisplayName + '</name>'),
    ('  <description>' + $Description + '</description>'),
    ('  <executable>' + $NodeExe + '</executable>'),
    ('  <arguments>' + $MainJs + '</arguments>'),
    ('  <workingdirectory>' + $Dir + '</workingdirectory>'),
    ('  <env name="BRIDGE_PORT" value="' + $Port + '"/>'),
    '  <startmode>Automatic</startmode>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="30 sec"/>',
    '  <onfailure action="none"/>',
    '  <resetfailure>1 hour</resetfailure>',
    ('  <logpath>' + $LogDir + '</logpath>'),
    '  <log mode="roll-by-size">',
    '    <sizeThreshold>10240</sizeThreshold>',
    '    <keepFiles>5</keepFiles>',
    '  </log>',
    '</service>'
)
Set-Content -Path $XmlPath -Value $lines -Encoding UTF8
Write-Host ('Wrote ' + $XmlPath)

# --- 3. Install + start ------------------------------------------------------
& $ExePath uninstall *> $null   # ignore error if not installed yet
& $ExePath install
if ($LASTEXITCODE -ne 0) { throw ('WinSW install failed with exit code ' + $LASTEXITCODE + ' (run elevated?)') }
& $ExePath start
Start-Sleep -Seconds 2
& $ExePath status

# --- 4. Health check ---------------------------------------------------------
try {
    $h = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $Port + '/health') -UseBasicParsing -TimeoutSec 10
    Write-Host ('Health check OK (HTTP ' + $h.StatusCode + ').')
} catch {
    Write-Warning ('Service installed, but health check failed: ' + $_.Exception.Message + ' - see logs in ' + $LogDir)
}
Write-Host ('Service "' + $DisplayName + '" is now listed in services.msc (StartType: Automatic).')
