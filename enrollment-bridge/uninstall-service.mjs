#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVC = 'SpersiaEnrollmentBridge';
const t = (args) => { try { execFileSync('schtasks', args, { stdio: 'inherit' }); } catch {} };
const n = (args) => { try { execFileSync('nssm', args, { stdio: 'inherit' }); } catch {} };
const s = (args) => { try { execFileSync('sc', args, { stdio: 'inherit' }); } catch {} };

// WinSW-based service (exe sits next to its .xml)
for (const name of [`${SVC}.exe`, 'WinSW-x64.exe', 'winsw.exe']) {
  const p = path.join(HERE, name);
  if (fs.existsSync(p)) { try { execFileSync(p, ['stop'], { stdio: 'inherit' }); } catch {}
                          try { execFileSync(p, ['uninstall'], { stdio: 'inherit' }); } catch {} }
}
n(['stop', SVC]); n(['remove', SVC, 'confirm']);
s(['stop', SVC]); s(['delete', SVC]);
t(['/End', '/TN', SVC]); t(['/Delete', '/F', '/TN', SVC]);
console.log('Removed service/task "SpersiaEnrollmentBridge" (whichever existed).');
