# Spersia Enrollment Bridge

Local HTTP agent (loopback `127.0.0.1:8485` by default) that lets the Spersia
web app drive fingerprint/iris/palm vendor SDKs and USB card readers from the
browser. The web UI probes `http://127.0.0.1:8485/health` automatically and
falls back to browser-only capture (webcam/file upload) when the bridge is
offline.

## Running modes

### 1. Console mode (simplest — no admin needed)
```bat
cd enrollment-bridge
npm install
npm start
```
Leave the window open. Health check: <http://127.0.0.1:8485/health>

### 2. Real Windows service (visible in services.msc as "SpersiaEnrollmentBridge")
A plain Node script cannot be a Windows service by itself — it needs a
service wrapper. `npm run install:service` auto-detects what is available,
in this order:

| Method | Requirement | Result |
|---|---|---|
| **NSSM** | `nssm.exe` on PATH ([nssm.cc](https://nssm.cc)) or `choco install nssm` | ✅ proper service, auto-start, visible in services.msc |
| **WinSW** | `winsw.exe` in this folder (from [WinSW releases](https://github.com/winsw/winsw/releases), rename to `winsw.exe`) | ✅ proper service via generated XML config |
| **sc.exe + exe** | first run `npm run pkg` to build `dist\spersia-enrollment-bridge.exe` | ✅ proper service, zero third-party runtime deps |
| **Task Scheduler** | none (automatic fallback) | ⚠️ NOT a service — runs hidden at every sign-in only; find it with `schtasks /query /tn SpersiaEnrollmentBridge`, **not** in services.msc |

Always run the installer from an **elevated (Administrator)** prompt if you
want the real-service paths:
```bat
cd enrollment-bridge
npm run install:service
```

### 3. Uninstall everything created above
```bat
npm run uninstall:service
```

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `BRIDGE_PORT` | `8485` | HTTP port (bound to 127.0.0.1 only) |
| `BRIDGE_TOKEN` | *(none)* | shared secret the web app must send (`X-Bridge-Token`) |
| `SPERSIA_SERVER_URL` | `http://localhost:3001/api` | project API base for pushing templates |
| `SDK_DIR` | `sdk/` | extra folder searched for vendor DLLs + `*.sdk.json` |
| `BRIDGE_ALLOWED_ORIGINS` | dev origins | comma-separated https origins allowed to call the bridge |

See `.env.example`. When installed as a service, set these with
`nssm set SpersiaEnrollmentBridge AppEnvironmentExtra VAR=value ...`
(or in the WinSW XML `<env>` block).

## Vendor SDKs (`sdk/` folder)

The bridge drives vendor biometric SDKs through **declarative manifests** — a
`*.sdk.json` file describing the DLL name, exports and capture call. One
manifest is already provided per supported vendor family:

| Manifest | Vendor / devices | Credential types |
|---|---|---|
| `cmitech-iris.sdk.json` | CMITech EF-45NC / EF-70 / EFM-45/70 / BMT-20 / EMX-30 | irisscan |
| `zkteco-zkls.sdk.json` | ZKTeco standalone terminals & readers | fingerprint, face, card |
| `hikvision-face.sdk.json` | Hikvision face terminals (HCNetSDK) | face |
| `suprema-biostation.sdk.json` | Suprema BioStation / XPass | fingerprint, face, irisscan |
| `tosan-fp.sdk.json` | Tosan TSN fingerprint reader | fingerprint |
| `example.sdk.json.sample` | template for any new reader | — |

**Important — the DLL binaries themselves are NOT in this repository.** Every
vendor above distributes its SDK under an EULA or a partner/support login
(CMITech's sits behind the members-only "Bulletin for F/W" page on
cmi-tech.com; ZKTeco/Hikvision require portal accounts; Suprema/Tosan ship via
resellers), so committing their `.dll` files would violate those licenses.
Instead:

1. Obtain the SDK from the vendor (contact links are in each manifest's
   `_source` field).
2. Copy the DLL(s) next to the matching `*.sdk.json` in `enrollment-bridge\sdk\`
   (or set `SDK_DIR` to the installed SDK folder).
3. The bridge auto-detects manifests on start; from the web app press
   «بازجستجو» (POST `/sdk/rescan`) to pick up new files without restarting.
4. If a vendor's export names differ from the manifest defaults, edit only the
   JSON — no code change is needed.

Status of every provider (ready / missing_dll / missing_ffi) is visible via
`GET /sdk/providers` and in the «ثبت شناسایی» page device picker.

## Verifying it works

```powershell
# is anything listening on the port?
netstat -ano | findstr :8485

# does the bridge answer?
Invoke-RestMethod http://127.0.0.1:8485/health

# which mode did we end up in?
Get-Service SpersiaEnrollmentBridge -ErrorAction SilentlyContinue   # service
schtasks /query /tn SpersiaEnrollmentBridge                          # logon task
tasklist /fi "imagename eq node.exe"                                 # console process
```

If `/health` never answers after the Task Scheduler fallback, run
`npm start` manually once — it will print the actual startup error
(port already in use, missing dependency, etc.).
