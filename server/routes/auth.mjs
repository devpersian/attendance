import express from 'express';
import bcrypt from 'bcryptjs';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { generateToken, authenticateToken, performLogin, issueRefreshToken, consumeRefreshToken, revokeRefreshToken, setPassword, recordPasswordHash } from '../services/auth.mjs';
import { validatePassword } from '../services/passwordPolicy.mjs';
import { writeAudit } from '../services/auditLog.mjs';
import { getUserRoleAssignments } from '../services/permissionTree.mjs';
import { rateLimit } from '../middleware/rateLimit.mjs';

const router = express.Router();

// Brute-force protection for credential endpoints
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });

// POST /api/auth/login - User login
// Phase 1 / P1.1: delegates to the shared performLogin() flow in services/auth.mjs
// so both login paths enforce lockout + audit identically.
router.post('/login', loginLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      await Logger.logRequest('POST', '/api/auth/login', 400, Date.now() - startTime, null, { reason: 'Missing credentials' });
      return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    }

    await Logger.log('info', 'LOGIN_ATTEMPT', 'auth', null, `Login attempt for user: ${username}`, { username });

    const result = await performLogin({ username, password, req });
    await Logger.logRequest('POST', '/api/auth/login', result.status, Date.now() - startTime, result.body?.user?.id ?? null);
    return res.status(result.status).json(result.body);
  } catch (error) {
    await Logger.logError('AUTH', 'login', null, 'Login error', error, { body: req.body });
    await Logger.logRequest('POST', '/api/auth/login', 500, Date.now() - startTime, null, { error: error.message });
    res.status(500).json({ error: 'خطا در ورود به سیستم' });
  }
});

// POST /api/auth/refresh — rotate the refresh token and issue a new access token
router.post('/refresh', loginLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken الزامی است' });

    const userId = await consumeRefreshToken(refreshToken);
    if (!userId) return res.status(401).json({ error: 'توکن تمدید نامعتبر یا منقضی است' });

    const users = await execute(
      'SELECT Id, Username, Email, Role, IsActive FROM attendance.Users WHERE Id = @id',
      { id: userId },
    );
    if (users.length === 0 || !users[0].IsActive) {
      return res.status(403).json({ error: 'حساب کاربری یافت نشد یا غیرفعال است' });
    }

    const user = users[0];
    const token = generateToken({ id: user.Id, username: user.Username, role: user.Role });
    const newRefreshToken = await issueRefreshToken(user.Id, req.headers?.['user-agent'] || null);

    res.json({ token, refreshToken: newRefreshToken });
  } catch (error) {
    await Logger.logError('AUTH', 'refresh', null, 'Token refresh failed', error);
    res.status(500).json({ error: 'خطا در تمدید توکن' });
  }
});

// POST /api/auth/logout — invalidate a refresh token (best effort)
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) await revokeRefreshToken(refreshToken);
  await writeAudit({ actorUserId: req.user?.id ?? null, action: 'LOGOUT', entity: 'user', entityId: req.user?.id ?? null, req });
  res.json({ ok: true });
});

// POST /api/auth/register - Register new user (admin only)
router.post('/register', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📝 Register attempt:', { username: req.body.username, role: req.body.role, email: req.body.email });
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      await Logger.log('warning', 'REGISTER_DENIED', 'auth', req.user.id, `Non-admin user attempted to register: ${req.user.username}`, { role: req.user.role });
      await Logger.logRequest('POST', '/api/auth/register', 403, Date.now() - startTime, req.user.id, { reason: 'Not admin' });
      return res.status(403).json({ error: 'فقط مدیران می‌توانند کاربر جدید ثبت کنند' });
    }

    const { username, password, email, role, employeeId } = req.body;

    // Validate input
    if (!username || !password) {
      console.log('❌ Validation failed: Missing username or password');
      await Logger.logRequest('POST', '/api/auth/register', 400, Date.now() - startTime, req.user.id, { reason: 'Missing fields' });
      return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    }

    const policy = validatePassword(password);
    if (!policy.ok) {
      await Logger.logRequest('POST', '/api/auth/register', 400, Date.now() - startTime, req.user.id, { reason: 'Password policy' });
      return res.status(400).json({ error: policy.errors.join(' — ') });
    }

    // Check if username already exists
    console.log('🔍 Checking if username exists:', username);
    const existingUsers = await execute(
      'SELECT Id FROM attendance.Users WHERE Username = @username',
      { username }
    );

    if (existingUsers.length > 0) {
      console.log('❌ Username already exists:', username);
      await Logger.log('warning', 'REGISTER_FAILED', 'auth', req.user.id, `Username already exists: ${username}`, { username });
      await Logger.logRequest('POST', '/api/auth/register', 400, Date.now() - startTime, req.user.id, { reason: 'Username exists' });
      return res.status(400).json({ error: 'این نام کاربری قبلاً ثبت شده است' });
    }

    // Validate employeeId if provided
    let finalEmployeeId = null;
    if (employeeId && employeeId !== '') {
      console.log('🔍 Validating employeeId:', employeeId);
      const existingEmployee = await execute(
        'SELECT Id FROM attendance.Employees WHERE Id = @id',
        { id: employeeId }
      );

      if (existingEmployee.length === 0) {
        console.log('❌ Employee not found:', employeeId);
        await Logger.log('warning', 'REGISTER_FAILED', 'auth', req.user.id, `Employee not found: ${employeeId}`, { employeeId });
        return res.status(400).json({ 
          error: 'کارمند انتخاب شده معتبر نیست',
          details: `EmployeeId "${employeeId}" در جدول Employees یافت نشد`
        });
      }
      finalEmployeeId = employeeId;
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log('✅ Password hashed successfully');

    // Create user (Id is INT IDENTITY — generated by the database)
    const userRole = role || 'employee';

    console.log('💾 Inserting user to database:', { username, role: userRole, employeeId: finalEmployeeId });
    const userId = await executeInsert(`INSERT INTO attendance.Users (Username, PasswordHash, Email, Role, IsActive, EmployeeId, CreatedAt)
       VALUES (@username, @passwordHash, @email, @role, 1, @employeeId, GETDATE())`, { username, passwordHash, email: email || null, role: userRole, employeeId: finalEmployeeId });
    console.log('✅ User inserted successfully');

    await recordPasswordHash(userId, passwordHash); // initial hash enters history (P1.3)
    await writeAudit({ actorUserId: req.user.id, action: 'USER_CREATED', entity: 'user', entityId: userId, detail: { username, role: userRole }, req });
    await Logger.log('success', 'USER_CREATED', 'auth', userId, `New user registered: ${username}`, { username, role: userRole, createdBy: req.user.id }, req.user.id);
    await Logger.logRequest('POST', '/api/auth/register', 201, Date.now() - startTime, req.user.id);

    console.log('✅ User registered successfully:', username);
    res.status(201).json({
      message: 'کاربر با موفقیت ثبت شد',
      user: {
        id: userId,
        username,
        email,
        role: userRole,
      },
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    await Logger.logError('AUTH', 'register', null, 'Register error', error, { body: req.body, userId: req.user?.id });
    await Logger.logRequest('POST', '/api/auth/register', 500, Date.now() - startTime, req.user?.id, { error: error.message });
    res.status(500).json({ 
      error: 'خطا در ثبت کاربر',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const users = await execute(
      'SELECT Id, Username, Email, Role, IsActive, LastLogin, CreatedAt FROM attendance.Users WHERE Id = @id',
      { id: req.user.id }
    );

    if (users.length === 0) {
      await Logger.logRequest('GET', '/api/auth/me', 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const user = users[0];

    let assignments = [];
    try {
      assignments = await getUserRoleAssignments(user.Id);
    } catch {
      // profile must still load even if assignment lookup fails
    }

    await Logger.logRequest('GET', '/api/auth/me', 200, Date.now() - startTime, req.user.id);

    res.json({
      id: user.Id,
      username: user.Username,
      email: user.Email,
      role: user.Role,
      roles: [...new Set(assignments.map(a => a.roleName))],
      roleAssignments: assignments,
      isActive: user.IsActive,
      lastLogin: user.LastLogin,
      createdAt: user.CreatedAt,
    });
  } catch (error) {
    await Logger.logError('AUTH', 'get_profile', req.user.id, 'Get profile error', error);
    await Logger.logRequest('GET', '/api/auth/me', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت اطلاعات کاربر' });
  }
});

// PUT /api/auth/change-password - Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      await Logger.logRequest('PUT', '/api/auth/change-password', 400, Date.now() - startTime, req.user.id, { reason: 'Missing fields' });
      return res.status(400).json({ error: 'رمز عبور فعلی و جدید الزامی است' });
    }

    if (newPassword.length < 6) {
      await Logger.logRequest('PUT', '/api/auth/change-password', 400, Date.now() - startTime, req.user.id, { reason: 'Password too short' });
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل 6 کاراکتر باشد' });
    }

    // Get user
    const users = await execute(
      'SELECT PasswordHash FROM attendance.Users WHERE Id = @id',
      { id: req.user.id }
    );

    if (users.length === 0) {
      await Logger.logRequest('PUT', '/api/auth/change-password', 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, users[0].PasswordHash);

    if (!isValidPassword) {
      await Logger.log('warning', 'PASSWORD_CHANGE_FAILED', 'auth', req.user.id, 'Invalid current password', { userId: req.user.id });
      await Logger.logRequest('PUT', '/api/auth/change-password', 401, Date.now() - startTime, req.user.id, { reason: 'Invalid current password' });
      return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است' });
    }

    // Phase 1: policy + history + session revocation + audit via setPassword()
    try {
      await setPassword({ userId: req.user.id, newPassword, actorUserId: req.user.id, req });
    } catch (policyError) {
      const status = policyError.status || 500;
      await Logger.logRequest('PUT', '/api/auth/change-password', status, Date.now() - startTime, req.user.id, { reason: 'password policy/history' });
      return res.status(status).json({ error: policyError.message });
    }

    await Logger.log('success', 'PASSWORD_CHANGED', 'auth', req.user.id, 'Password changed successfully', { userId: req.user.id }, req.user.id);
    await Logger.logRequest('PUT', '/api/auth/change-password', 200, Date.now() - startTime, req.user.id);

    res.json({ message: 'رمز عبور با موفقیت تغییر کرد' });
  } catch (error) {
    await Logger.logError('AUTH', 'change_password', req.user.id, 'Change password error', error);
    await Logger.logRequest('PUT', '/api/auth/change-password', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در تغییر رمز عبور' });
  }
});

// PUT /api/auth/update-profile - Update user profile
router.put('/update-profile', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { email } = req.body;

    // Update profile
    await execute(
      'UPDATE attendance.Users SET Email = @email, UpdatedAt = GETDATE() WHERE Id = @id',
      { email: email || null, id: req.user.id }
    );

    await Logger.log('success', 'PROFILE_UPDATED', 'auth', req.user.id, 'Profile updated', { email }, req.user.id);
    await Logger.logRequest('PUT', '/api/auth/update-profile', 200, Date.now() - startTime, req.user.id);

    res.json({ message: 'اطلاعات کاربری با موفقیت به‌روزرسانی شد' });
  } catch (error) {
    await Logger.logError('AUTH', 'update_profile', req.user.id, 'Update profile error', error);
    await Logger.logRequest('PUT', '/api/auth/update-profile', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در به‌روزرسانی اطلاعات کاربری' });
  }
});

export default router;
