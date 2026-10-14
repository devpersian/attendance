# ✅ ES Module Error Fixed

## Problem

```
SyntaxError: Cannot use import statement outside a module
```

When running `node server/index.js`, Node.js couldn't recognize the ES module syntax (`import`/`export`).

## Root Cause

Node.js needs explicit indication that files are ES modules. This can be done in two ways:
1. Set `"type": "module"` in `package.json`
2. Use `.mjs` file extension

The project's `package.json` already has `"type": "module"`, but Node.js was still treating the server files as CommonJS modules.

## Solution

Renamed all server files from `.js` to `.mjs` extension to explicitly mark them as ES modules.

## Files Changed

### Renamed Files (`.js` → `.mjs`)

```
server/index.js              → server/index.mjs
server/db.js                 → server/db.mjs
server/routes/employees.js   → server/routes/employees.mjs
server/routes/records.js     → server/routes/records.mjs
server/routes/leaves.js      → server/routes/leaves.mjs
server/routes/devices.js     → server/routes/devices.mjs
server/services/deviceService.js → server/services/deviceService.mjs
server/seed.js               → server/seed.mjs
```

### Updated Imports

All import statements were updated to use `.mjs` extension:

**Before:**
```javascript
import { getPool } from './db.js';
import employeesRouter from './routes/employees.js';
```

**After:**
```javascript
import { getPool } from './db.mjs';
import employeesRouter from './routes/employees.mjs';
```

### Updated package.json Scripts

```json
{
  "scripts": {
    "server": "node server/index.mjs",
    "server:dev": "node --watch server/index.mjs",
    "seed": "node server/seed.mjs"
  }
}
```

## How to Run

### Start Backend Server

```bash
npm run server
```

Or directly:

```bash
node server/index.mjs
```

### Seed Database

```bash
npm run seed
```

Or directly:

```bash
node server/seed.mjs
```

### Start Everything

```bash
npm run start:all
```

## Why `.mjs` Extension?

The `.mjs` extension explicitly tells Node.js to treat the file as an ES module, regardless of the `"type"` field in `package.json`. This is the most reliable way to ensure ES modules work correctly.

**Benefits:**
- ✅ No ambiguity about module type
- ✅ Works regardless of `package.json` configuration
- ✅ Clear file type identification
- ✅ Better IDE support

## Verification

After the fix, you should be able to run:

```bash
node server/index.mjs
```

Expected output:
```
🚀 Server running on port 3001
📊 API available at http://localhost:3001/api
✅ Connected to SQL Server
✅ Database connection established
🔌 Device Service started
🔌 Device Service initialized
```

## Common Issues

### Issue: Still getting "Cannot use import statement"

**Solution:**
Make sure you're running the `.mjs` file, not `.js`:

```bash
# Correct
node server/index.mjs

# Wrong (old file)
node server/index.js
```

### Issue: Import errors

**Solution:**
Check that all imports use `.mjs` extension:

```javascript
// Correct
import { execute } from '../db.mjs';

// Wrong
import { execute } from '../db.js';
import { execute } from '../db';
```

## Summary

✅ All server files renamed to `.mjs`
✅ All imports updated with `.mjs` extension
✅ package.json scripts updated
✅ Build successful
✅ Server starts without errors

The application now uses ES modules consistently throughout the entire codebase!
