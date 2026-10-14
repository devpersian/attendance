import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.mjs';
import employeesRouter from './routes/employees.mjs';
import recordsRouter from './routes/records.mjs';
import leavesRouter from './routes/leaves.mjs';
import devicesRouter from './routes/devices.mjs';
import adminRouter from './routes/admin.mjs';
import companyRouter from './routes/company.mjs';
import usersRouter from './routes/users.mjs';
import authRouter from './routes/auth.mjs';
import rolesRouter from './routes/roles.mjs';
import permissionsRouter from './routes/permissions.mjs';
import userRolesRouter from './routes/user-roles.mjs';
import unitsRouter from './routes/units.mjs';
import shiftsRouter from './routes/shifts.mjs';
import shiftPatternsRouter from './routes/shift-patterns.mjs';
import workingHoursRulesRouter from './routes/working-hours-rules.mjs';
import employeeShiftsRouter from './routes/employee-shifts.mjs';
import reportsRouter from './routes/reports.mjs';
import streamRouter from './routes/stream.mjs';
import enrollmentsRouter from './routes/enrollments.mjs';
import holidaysRouter from './routes/holidays.mjs';
import notificationsRouter from './routes/notifications.mjs';
import payrollRouter from './routes/payroll.mjs';
import missionsRouter from './routes/missions.mjs';
import { getDeviceService } from './services/deviceService.mjs';
import { runMigrations, migrationsEnabled } from './services/migrate.mjs';
import { Logger } from './services/logger.mjs';
import { ensureJwtSecret, securityHeaders, rateLimit } from './middleware/security.mjs';

dotenv.config();
ensureJwtSecret();

const app = express();
app.set('trust proxy', 1); // correct client IP behind nginx/IIS reverse proxies
const SERVER_PORT = process.env.SERVER_PORT || 3001;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${CLIENT_PORT}`;

console.log(`📋 Configuration:`);
console.log(`   Server Port: ${SERVER_PORT}`);
console.log(`   Client Port: ${CLIENT_PORT}`);
console.log(`   Frontend URL: ${FRONTEND_URL}`);

// Middleware - Enhanced CORS configuration (comma-separated origins supported)
const corsOrigins = (process.env.FRONTEND_URL || FRONTEND_URL)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(securityHeaders);
app.use(rateLimit({ windowMs: 15 * 60_000, max: 600 }));
app.use(express.json({ limit: '10mb' })); // enrollment templates arrive as base64 payloads

// Request logging middleware
app.use(async (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    };

    if (res.statusCode >= 400) {
      await Logger.warning('HTTP_REQUEST', 'api', null, `${req.method} ${req.url} - ${res.statusCode}`, logData);
    } else {
      await Logger.info('HTTP_REQUEST', 'api', null, `${req.method} ${req.url} - ${res.statusCode}`, logData);
    }
  });

  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api', streamRouter); // SSE realtime feed (GET /api/stream)
app.use('/api/reports', reportsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/records', recordsRouter);
app.use('/api/leaves', leavesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/company', companyRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/user-roles', userRolesRouter);
app.use('/api/units', unitsRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/shift-patterns', shiftPatternsRouter);
app.use('/api/working-hours-rules', workingHoursRulesRouter);
app.use('/api/employee-shifts', employeeShiftsRouter);
app.use('/api/enrollments', enrollmentsRouter);
app.use('/api/holidays', holidaysRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/missions', missionsRouter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await getPool();
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: error.message });
  }
});

// Initialize Device Service
let deviceService = null;

// Serve the built frontend (production / Docker single-container mode).
// In dev, Vite serves the SPA and proxies /api here instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: any non-API GET request returns index.html
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log(`🌐 Serving static frontend from ${distDir}`);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(SERVER_PORT, async () => {
  console.log(`🚀 Server running on port ${SERVER_PORT}`);
  console.log(`📊 API available at http://localhost:${SERVER_PORT}/api`);
  
  try {
    await getPool();
    console.log('✅ Database connection established');

    // Apply pending DB migrations (Phase 3 / P3.1). Default ON; disable with
    // RUN_MIGRATIONS=false if you manage the schema manually via SSMS.
    if (migrationsEnabled()) {
      try {
        await runMigrations();
      } catch (mErr) {
        console.error(`⚠️  Migrations failed: ${mErr.message}`);
        console.error('⚠️  Server continues running — fix the migration, then restart.');
      }
    } else {
      console.log('⏭️  Migrations skipped (RUN_MIGRATIONS disabled)');
    }

    // Start Device Service
    deviceService = getDeviceService();
    console.log('🔌 Device Service initialized');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.log('⚠️  Server is running but database is not connected');
    console.log('⚠️  Please check your .env file and ensure SQL Server is running');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (deviceService) {
    deviceService.stop();
  }
  process.exit(0);
});

export default app;
