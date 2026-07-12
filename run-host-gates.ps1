<#
.SYNOPSIS
  Cairn — full host verification runbook (CLAUDE.md §17.6 / §19, "no slop").

  Runs every gate the Stage 18.5 Verification note still owes a real-host run for, in
  the order specified, against the REAL Docker Postgres. Tees a complete transcript to
  gate-logs\gates-<timestamp>.log so the result can be reviewed (and the build-status.md
  note updated) from the actual output — never assumed.

  GATES
    1. Desktop + shared : pnpm typecheck, pnpm lint, pnpm test:unit, pnpm build, pnpm test:e2e
    2. Server suite     : docker compose up -d (Postgres) -> pnpm --filter @cairn/server run test
                          (auth / vault / billing / webhook integration + the 6 DB-free docs tests)
    3. Docs routes smoke: ENABLE_API_DOCS=true  -> GET /openapi.json (3.1), GET /docs (Scalar,
                          relaxed CSP only on doc routes), GET /docs/standalone.js
                          ENABLE_API_DOCS=false -> all three doc routes 404

.NOTES
  Run from the repo root in PowerShell (Windows PowerShell 5.1 or PowerShell 7+):
      pwsh -File .\run-host-gates.ps1
  Requires: pnpm, Docker Desktop (running), and a free TCP port 5432 + 3000 (override below).
  Nothing here weakens a gate: lint stays --max-warnings 0 (enforced by each package's own
  lint script), tests run the full suites, the DB is real.
#>

[CmdletBinding()]
param(
  # Set if `node_modules` may be stale / missing — installs with the frozen lockfile first.
  [switch]$Install,
  # Host port to publish the Docker Postgres on. 0 = auto-discover at runtime (recommended):
  # the script tries a list of candidates and PROVES each one both publishes in Docker and
  # round-trips host-side before using it. Pass a specific port to force it (tried first).
  [int]$PostgresPort = 0,
  # Port the docs-smoke server listens on.
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Continue'   # one red gate must not abort the rest; we record each
$repoRoot = $PSScriptRoot
Set-Location $repoRoot

$logDir = Join-Path $repoRoot 'gate-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $logDir "gates-$stamp.log"

# ── transcript helpers ────────────────────────────────────────────────────────────────────
$script:results = [System.Collections.Generic.List[object]]::new()

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'HH:mm:ss')  $Message"
  $line | Tee-Object -FilePath $log -Append
}

function Invoke-Gate {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Action
  )
  Write-Log ''
  Write-Log "===== GATE: $Name ====="
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $ok = $false
  try {
    # Run the command, streaming combined stdout+stderr into the transcript.
    & $Action 2>&1 | Tee-Object -FilePath $log -Append
    $ok = ($LASTEXITCODE -eq 0)
  } catch {
    ($_ | Out-String) | Tee-Object -FilePath $log -Append
    $ok = $false
  }
  $sw.Stop()
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Log ("----- $Name : $status  ({0:n1}s, exit={1}) -----" -f $sw.Elapsed.TotalSeconds, $LASTEXITCODE)
  $script:results.Add([pscustomobject]@{ Gate = $Name; Status = $status; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1) })
  return $ok
}

# Robust status-code probe that works on both PS 5.1 and 7+ (no -SkipHttpErrorCheck dependency).
function Get-HttpStatus {
  param([string]$Url)
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode.value__ }
    return -1
  }
}

# ── preamble: tool versions ───────────────────────────────────────────────────────────────
Write-Log "Cairn host gates — $stamp"
Write-Log "repo: $repoRoot"
Write-Log "log : $log"
Write-Log "node: $(node -v 2>&1)"
Write-Log "pnpm: $(pnpm -v 2>&1)"
Write-Log "docker: $(docker --version 2>&1)"

if ($Install) {
  Invoke-Gate -Name 'pnpm install --frozen-lockfile' -Action { pnpm install --frozen-lockfile } | Out-Null
}

# ── 1. Desktop + shared gates ─────────────────────────────────────────────────────────────
Invoke-Gate -Name 'pnpm typecheck'  -Action { pnpm typecheck } | Out-Null
# Each package's own lint script already pins --max-warnings 0; the root `lint` fans out -r.
Invoke-Gate -Name 'pnpm lint'        -Action { pnpm lint } | Out-Null
Invoke-Gate -Name 'pnpm test:unit'   -Action { pnpm test:unit } | Out-Null
Invoke-Gate -Name 'pnpm build'       -Action { pnpm build } | Out-Null
Invoke-Gate -Name 'pnpm test:e2e'    -Action { pnpm test:e2e } | Out-Null

# ── 2. Server suite (real Postgres) ───────────────────────────────────────────────────────
$compose = 'apps/server/docker-compose.yml'

# Secrets the server/migrate env schema requires (>=32 chars). Set once; reused by the
# host-side migrate probe below and the docs-smoke server later.
$env:PASSWORD_PEPPER = 'host-gate-pepper-0000000000000000000000'   # 39 chars, dev-only
$env:JWT_SECRET      = 'host-gate-jwt-secret-000000000000000000'    # 39 chars, dev-only

# Discover a host port that genuinely works. Two real failure modes were observed and must
# both be avoided, WITHOUT assuming any specific number is good:
#   * 5432  — a local PostgreSQL owns 127.0.0.1:5432. Docker still publishes 0.0.0.0:5432, so
#             `up` "succeeds", but the tests' localhost connection is answered by the *host*
#             Postgres (wrong creds) -> "password authentication failed for user cairn".
#   * 55432 — inside the Windows WinNAT/Hyper-V *excluded* port range; the OS refuses the
#             bind -> "ports are not available ... forbidden by its access permissions".
# So for each candidate we PROVE it: publish the container, then connect host-side via the
# server's own migrate script (the exact path the tests use). Accept the first port that
# (a) publishes and (b) the migrate round-trips. A `password authentication failed` means a
# different Postgres answered -> reject and try the next port.
$candidatePorts = @()
if ($PostgresPort -gt 0) { $candidatePorts += $PostgresPort }   # explicit override tried first
$candidatePorts += 5433, 5434, 5435, 6432, 6433, 7654, 15432
$candidatePorts = $candidatePorts | Select-Object -Unique

$dbUrl = $null
$chosenPort = 0
foreach ($p in $candidatePorts) {
  Write-Log ''
  Write-Log "Trying Postgres host port $p ..."
  $env:POSTGRES_PORT = "$p"
  $tryUrl = "postgres://cairn:cairn@localhost:$p/cairn"
  $env:DATABASE_URL = $tryUrl

  # Pristine DB each attempt (a stale volume keeps its first-init credentials). Silenced —
  # docker writes progress to stderr, which PowerShell would otherwise render as red errors.
  docker compose -f $compose down -v --remove-orphans *> $null
  $upOut = (docker compose -f $compose up -d postgres 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $upOut -match 'ports are not available' -or $upOut -match 'already allocated') {
    Write-Log "  port $p cannot be published (OS-excluded or in use); next."
    continue
  }

  # Wait for the container DB to report healthy.
  foreach ($i in 1..40) {
    $h = (docker compose -f $compose ps --format '{{.Health}}' postgres 2>&1 | Select-Object -First 1)
    if ($h -match 'healthy') { break }
    Start-Sleep -Seconds 2
  }

  # Prove the tests' host-side path via migrate (also pre-migrates the DB on success).
  $ok = $false; $reject = $false; $migrateOut = ''
  foreach ($i in 1..8) {
    $migrateOut = (pnpm --filter '@cairn/server' run migrate 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    if ($migrateOut -match 'password authentication failed') {
      Write-Log "  port $p is answered by a DIFFERENT Postgres (auth failed); next."
      $reject = $true; break
    }
    Start-Sleep -Seconds 2   # ECONNREFUSED etc — container may still be warming up
  }
  if ($ok) { $chosenPort = $p; $dbUrl = $tryUrl; Write-Log "  OK: published + host-side migrate succeeded on port $p"; break }
  if (-not $reject) { Write-Log "  port $p never became reachable host-side; next." }
}

$pgUp = ($chosenPort -gt 0)
$script:results.Add([pscustomobject]@{ Gate = 'postgres up + host-side reachable'; Status = $(if ($pgUp) { 'PASS' } else { 'FAIL' }); Seconds = 0 })
if ($pgUp) {
  $env:POSTGRES_PORT = "$chosenPort"
  $env:DATABASE_URL  = $dbUrl
  Write-Log "Using Postgres on host port $chosenPort ($dbUrl)"
} else {
  Write-Log 'ERROR: no candidate host port both published AND round-tripped host-side. See above.'
}

Invoke-Gate -Name 'pnpm --filter @cairn/server run test (full suite + 6 docs tests)' -Action {
  pnpm --filter '@cairn/server' run test
} | Out-Null

# ── 3. Docs routes smoke ──────────────────────────────────────────────────────────────────
# Shared env for the live server (server self-migrates on boot; secrets must be >=32 chars).
$env:DATABASE_URL    = $dbUrl
$env:PASSWORD_PEPPER = 'host-gate-pepper-0000000000000000000000'   # 39 chars, dev-only
$env:JWT_SECRET      = 'host-gate-jwt-secret-000000000000000000'    # 39 chars, dev-only
$env:PORT            = "$ApiPort"
$env:HOST            = '127.0.0.1'
$env:CORS_ORIGINS    = 'http://localhost:5173'
$env:COOKIE_SECURE   = 'false'
$base = "http://127.0.0.1:$ApiPort"

function Stop-PortListeners {
  param([int]$Port)
  # Kill whatever is listening on $Port. taskkill /T on the launch cmd PID can miss an
  # orphaned node child, leaving a stale server that answers the next /health + doc probes —
  # which is how the ENABLE_API_DOCS=false run kept seeing a docs-enabled server (200, not
  # 404). Killing by port is the reliable backstop. Get-NetTCPConnection throws when nothing
  # is listening; swallow it.
  try {
    $owners = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop).OwningProcess |
      Sort-Object -Unique
    foreach ($procId in $owners) {
      if ($procId -and $procId -ne 0) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch { }
}

function Start-DocsServer {
  param([string]$EnableDocs)
  # Guarantee a clean port first, so the health poll below can't be satisfied by a survivor
  # from the previous phase (which would serve its own ENABLE_API_DOCS state, not this one).
  Stop-PortListeners -Port $ApiPort
  $env:ENABLE_API_DOCS = $EnableDocs
  $out = Join-Path $logDir "server-docs-$EnableDocs-$stamp.out.log"
  # Launch through cmd.exe: `pnpm` on Windows is a .cmd/.ps1 shim, which Start-Process
  # cannot exec directly (InvalidOperationException) — cmd.exe resolves it via PATHEXT.
  #
  # Set ENABLE_API_DOCS *inside* the child cmd (`set VAR=val&& …`) rather than relying on
  # Start-Process to inherit the freshly-set parent `$env:`. That inheritance proved
  # unreliable here: the ENABLE_API_DOCS=false server kept serving docs (200 instead of 404)
  # because the child fell back to the schema default ('true'). Setting it in-process makes
  # the value unambiguous. NOTE: there is deliberately NO space before `&&` — `set X=false &&`
  # would capture a trailing space ("false "), which the Zod enum(['true','false']) rejects,
  # crashing boot. `$EnableDocs` is only ever the literal 'true'/'false', so no quoting is
  # needed; Start-Process passes the whole string as one quoted arg to `cmd /c`.
  $inner = "set ENABLE_API_DOCS=$EnableDocs&& pnpm --filter @cairn/server run start"
  $proc = Start-Process -FilePath $env:ComSpec `
    -ArgumentList @('/c', $inner) `
    -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError "$out.err"
  # Poll /health until the server is listening (up to ~40s; covers migrate-on-boot).
  foreach ($i in 1..40) {
    Start-Sleep -Seconds 1
    if ((Get-HttpStatus "$base/health") -eq 200) { return $proc }
    if ($proc.HasExited) { break }
  }
  return $proc
}

function Stop-DocsServer {
  param($Proc)
  if ($Proc -and -not $Proc.HasExited) {
    # The launch chain is cmd.exe -> pnpm(node) -> tsx(node) -> server. taskkill /T kills
    # the whole tree by PID, so no node child keeps port $ApiPort bound for the next run.
    taskkill /PID $Proc.Id /T /F *> $null
  }
  # Backstop: taskkill /T can miss an orphaned node child, so also kill by port. Without this
  # the next phase's health poll can bind to a survivor and read the wrong docs state.
  Stop-PortListeners -Port $ApiPort
}

# 3a. ENABLE_API_DOCS=true — the three doc routes serve, with relaxed CSP only on them.
$docsOk = $true
$proc = Start-DocsServer -EnableDocs 'true'
if ((Get-HttpStatus "$base/health") -ne 200) {
  Write-Log 'FAIL: docs-smoke server (ENABLE_API_DOCS=true) never became healthy.'
  $docsOk = $false
} else {
  try {
    $spec = Invoke-WebRequest -Uri "$base/openapi.json" -UseBasicParsing -TimeoutSec 10
    $json = $spec.Content | ConvertFrom-Json
    $specOk = ($spec.StatusCode -eq 200) -and ($json.openapi -like '3.1*')
    Write-Log "GET /openapi.json -> $($spec.StatusCode), openapi=$($json.openapi)  [$(if($specOk){'PASS'}else{'FAIL'})]"
    if (-not $specOk) { $docsOk = $false }

    $page = Invoke-WebRequest -Uri "$base/docs" -UseBasicParsing -TimeoutSec 10
    $pageCsp = $page.Headers['Content-Security-Policy']
    $pageOk = ($page.StatusCode -eq 200) -and ($page.Content -match 'api-reference') -and ($pageCsp -match "script-src 'self'")
    Write-Log "GET /docs -> $($page.StatusCode), CSP='$pageCsp'  [$(if($pageOk){'PASS'}else{'FAIL'})]"
    if (-not $pageOk) { $docsOk = $false }

    $bundle = Get-HttpStatus "$base/docs/standalone.js"
    Write-Log "GET /docs/standalone.js -> $bundle  [$(if($bundle -eq 200){'PASS'}else{'FAIL'})]"
    if ($bundle -ne 200) { $docsOk = $false }

    # Confirm a NON-doc route keeps the strict global CSP (relaxation is doc-routes only).
    # Discriminator: `unsafe-eval` appears ONLY in the docs CSP (DOCS_CSP in routes.ts), never
    # in helmet's default policy. (We can't key on `script-src 'self'` — helmet's default has
    # that too — nor on `unsafe-inline`, which helmet's default style-src legitimately carries.)
    $health = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 10
    $healthCsp = $health.Headers['Content-Security-Policy']
    $strictOk = ($healthCsp -match "default-src 'none'") -and ($healthCsp -notmatch "unsafe-eval")
    Write-Log "GET /health CSP='$healthCsp'  [strict: $(if($strictOk){'PASS'}else{'FAIL'})]"
    if (-not $strictOk) { $docsOk = $false }
  } catch {
    Write-Log "FAIL during ENABLE_API_DOCS=true probes: $($_ | Out-String)"
    $docsOk = $false
  }
}
Stop-DocsServer $proc
Start-Sleep -Seconds 2

# 3b. ENABLE_API_DOCS=false — all three doc routes must 404 (revealing nothing).
$proc = Start-DocsServer -EnableDocs 'false'
if ((Get-HttpStatus "$base/health") -ne 200) {
  Write-Log 'FAIL: docs-smoke server (ENABLE_API_DOCS=false) never became healthy.'
  $docsOk = $false
} else {
  foreach ($route in @('/openapi.json', '/docs', '/docs/standalone.js')) {
    $code = Get-HttpStatus "$base$route"
    Write-Log "GET $route (docs disabled) -> $code  [$(if($code -eq 404){'PASS'}else{'FAIL'})]"
    if ($code -ne 404) { $docsOk = $false }
  }
}
Stop-DocsServer $proc

$script:results.Add([pscustomobject]@{ Gate = 'docs routes smoke (enabled + disabled)'; Status = if ($docsOk) { 'PASS' } else { 'FAIL' }; Seconds = 0 })

# ── teardown + summary ────────────────────────────────────────────────────────────────────
Write-Log ''
Write-Log 'Tearing down Postgres (docker compose down -v)...'
# Silence docker's stderr progress (PowerShell would render it as red "errors" otherwise).
docker compose -f $compose down -v *> $null
Write-Log '  done.'

Write-Log ''
Write-Log '================ SUMMARY ================'
$script:results | Format-Table -AutoSize | Out-String | Tee-Object -FilePath $log -Append
$failed = @($script:results | Where-Object { $_.Status -ne 'PASS' })
if ($failed.Count -eq 0) {
  Write-Log "ALL GREEN. Full transcript: $log"
  exit 0
} else {
  Write-Log "RED gates: $($failed.Gate -join ', '). Full transcript: $log"
  exit 1
}
