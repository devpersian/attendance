#!/usr/bin/env node
// Registers the Spersia Enrollment Bridge as a real Windows service.
// Order: NSSM -> WinSW (auto-download/install) -> sc.exe (+ packaged exe) -> logon-task fallback.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVC = 'SpersiaEnrollmentBridge';
const DISPLAY = 'Spersia Enrollment Bridge';
const PORT = process.env.BRIDGE_PORT || '8485';

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const trySh = (cmd, args) => { try { sh(cmd, args); return true; } catch { return false; } };
const has = (c) => { try { execFileSync('where', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
function isAdmin() { try { execFileSync('net', ['session'], { stdio: 'ignore' }); return true; } catch { return false; } }
const healthOk = () => fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.ok).catch(() => false);

async function main() {
  if (!isAdmin()) {
    // Relaunch elevated so SCM registration actually works.
    console.log('Not elevated — relaunching with administrator privileges (approve UAC)...');
    const ps = `"${SVC}"`;
    try {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Start-Process -FilePath '${process.execPath}' -ArgumentList '${path.join(HERE, 'install-service.mjs')}' -Verb RunAs`], { stdio: 'ignore' });
      console.log('A new elevated window was opened to finish the service installation.');
      return;
    } catch { /* fall through to task fallback */ }
    const script = `powershell -NoProfile -Command "Set-Location -Path '${HERE}'; & '${process.execPath}' main.js >> '${path.join(HERE, 'bridge.log')}' 2>&1"`;
    trySh('schtasks', ['/Create', '/F', '/TN', SVC, '/SC', 'ONLOGON', '/TR', script]);
    trySh('schtasks', ['/Run', '/TN', SVC]);
    console.log('Created scheduled logon task (fallback, NOT a real service).');
    return;
  }

  // remove any previous fallback task first
  trySh('schtasks', ['/Delete', '/F', '/TN', SVC]);

  // 1) NSSM
  if (has('nssm')) {
    trySh('nssm', ['stop', SVC]); trySh('nssm', ['remove', SVC, 'confirm']);
    if (trySh('nssm', ['install', SVC, process.execPath, path.join(HERE, 'main.js')]) &&
        trySh('nssm', ['set', SVC, 'AppDirectory', HERE]) &&
        trySh('nssm', ['set', SVC, 'Start', 'SERVICE_AUTO_START']) &&
        trySh('nssm', ['start', SVC])) {
      await done('NSSM'); return;
    }
  }

  // 2) WinSW (recommended): reuse winsw.ps1 which downloads + installs + starts
  const winswExe = path.join(HERE, `${SVC}.exe`);
  if (fs.existsSync(winswExe) || has('powershell')) {
    if (trySh('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'winsw.ps1')])) {
      await done('WinSW'); return;
    }
  }

  // 3) sc.exe with packaged exe
  const pkgExe = path.join(HERE, 'dist', 'spersia-enrollment-bridge.exe');
  if (fs.existsSync(pkgExe)) {
    trySh('sc', ['delete', SVC]);
    if (trySh('sc', ['create', SVC, 'binPath=', `"${pkgExe}"`, 'start=', 'auto', 'DisplayName=', DISPLAY]) &&
        trySh('sc', ['start', SVC])) { await done('sc.exe'); return; }
  }

  console.error('Could not register a real service. Run "npm run pkg" first, or open winsw.ps1 manually in an elevated shell.');
  process.exitCode = 1;
}

async function done(via) {
  const ok = await healthOk();
  console.log(`Installed via ${via}. It IS listed in services.msc as "${DISPLAY}" (Automatic).`);
  console.log(`Health check http://127.0.0.1:${PORT}/health : ${ok ? 'OK' : 'NOT RESPONDING YET — check event viewer / service logs.'}`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
