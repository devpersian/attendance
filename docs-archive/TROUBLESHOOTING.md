# Troubleshooting Guide - CORS Error Fix

## Problem
You were experiencing a CORS error when trying to add a new employee.

## Root Causes Identified

1. **Module System Inconsistency**: Backend was using CommonJS (`require`) while frontend uses ES modules (`import`)
2. **Backend Not Running**: The API calls were failing because the backend server wasn't running
3. **No Fallback Mechanism**: When API was unavailable, the app had no fallback

## Solutions Implemented

### 1. Converted Backend to ES Modules

All backend files now use ES module syntax (`import`/`export`) instead of CommonJS (`require`/`module.exports`):

**Before:**
```javascript
const express = require('express');
const { execute } = require('../db');
module.exports = router;
```

**After:**
```javascript
import express from 'express';
import { execute } from '../db.js';
export default router;
```

**Files Updated:**
- `server/index.js`
- `server/db.js`
- `server/routes/employees.js`
- `server/routes/records.js`
- `server/routes/leaves.js`
- `server/routes/devices.js`
- `server/services/deviceService.js`
- `server/seed.js`

### 2. Enhanced CORS Configuration

Updated CORS settings in `server/index.js`:

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 3. Added Local Storage Fallback

When the backend API is unavailable, the frontend now automatically falls back to local storage:

- **Read Operations**: If API fails, reads from local storage
- **Write Operations**: If API fails, writes to local storage
- **Data Persistence**: All changes are saved locally when API is down

**Implementation in `src/utils/storage.ts`:**

```typescript
// Local storage fallback
const LOCAL_STORAGE_KEY = 'attendance_local_data';

function getLocalData() {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : { employees: [], records: [], leaves: [] };
}

export async function createEmployee(employee: Employee): Promise<void> {
  try {
    await employeesAPI.create(employee);
    // Refresh cache from API
    const employees = await employeesAPI.getAll();
    setCache('employees', employees);
  } catch (error) {
    console.error('Error creating employee via API, using local storage:', error);
    const localData = getLocalData();
    localData.employees.push(employee);
    setLocalData({ employees: localData.employees });
  }
}
```

### 4. Added Request Timeouts

Added timeout handling to prevent hanging requests:

```typescript
const response = await fetch(url, {
  ...defaultOptions,
  signal: AbortSignal.timeout(10000) // 10 second timeout
});
```

## How to Use

### Option 1: Run with Backend (Recommended)

1. **Start SQL Server** and run the database schema:
   ```bash
   sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your SQL Server credentials
   ```

3. **Start backend server**:
   ```bash
   node server/index.js
   ```

4. **Start frontend** (in another terminal):
   ```bash
   npm run dev
   ```

5. **Access the app**: http://localhost:5173

### Option 2: Run without Backend (Demo Mode)

If you just want to test the frontend without setting up SQL Server:

1. **Start frontend only**:
   ```bash
   npm run dev
   ```

2. **Access the app**: http://localhost:5173

The app will automatically use local storage for all operations. You can:
- Add/edit/delete employees
- Record attendance
- Manage leaves
- View reports

**Note**: Data will be stored in your browser's local storage and won't persist across different browsers or devices.

## Verification

### Check if Backend is Running

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","database":"connected"}
```

### Check CORS Headers

```bash
curl -I http://localhost:3001/api/employees
```

You should see:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

## Common Issues

### Issue: "Failed to fetch" Error

**Cause**: Backend server is not running

**Solution**: 
- Start the backend: `node server/index.js`
- Or use demo mode (frontend will use local storage)

### Issue: CORS Error Persists

**Cause**: Frontend and backend are on different ports/origins

**Solution**:
1. Check `.env` file has correct `FRONTEND_URL`
2. Restart backend server after changing `.env`
3. Clear browser cache and reload

### Issue: Database Connection Error

**Cause**: SQL Server is not running or credentials are wrong

**Solution**:
1. Verify SQL Server is running
2. Check credentials in `.env` file
3. Run database schema: `sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql`

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│   (React/Vite)  │
│   Port: 5173    │
└────────┬────────┘
         │
         │ HTTP/REST API
         │ (with fallback to localStorage)
         │
         ▼
┌─────────────────┐
│   Backend       │
│   (Express.js)  │
│   Port: 3001    │
└────────┬────────┘
         │
         │ SQL Queries
         │
         ▼
┌─────────────────┐
│   SQL Server    │
│   Port: 1433    │
└─────────────────┘
```

## Next Steps

1. ✅ Backend converted to ES modules
2. ✅ CORS configuration enhanced
3. ✅ Local storage fallback implemented
4. ✅ Request timeouts added
5. ⏭️ Test adding employees (with and without backend)
6. ⏭️ Verify data persistence
7. ⏭️ Test device integration (if using physical devices)

## Support

If you continue to experience issues:

1. Check browser console for detailed error messages
2. Check backend server logs
3. Verify all environment variables are set correctly
4. Ensure SQL Server is running and accessible
5. Check network connectivity between frontend and backend
