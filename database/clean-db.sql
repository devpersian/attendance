-- ============================================
-- CLEAN DATABASE SCRIPT (Fixed Version)
-- Properly handles foreign keys and duplicate data
-- Uses 'attendance' schema
-- ============================================

USE AttendanceDB;
GO

-- ============================================
-- STEP 1: DISABLE ALL FOREIGN KEY CONSTRAINTS
-- ============================================
PRINT 'Disabling foreign key constraints...';

-- Disable all foreign key constraints in the attendance schema
DECLARE @sql NVARCHAR(MAX) = '';
SELECT @sql = @sql + 'ALTER TABLE attendance.' + QUOTENAME(t.name) + ' NOCHECK CONSTRAINT ALL;' + CHAR(13)
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'attendance';

EXEC sp_executesql @sql;
PRINT 'Foreign key constraints disabled.';
GO

-- ============================================
-- STEP 2: DELETE DATA FROM ALL TABLES
-- Using DELETE instead of TRUNCATE to avoid FK issues
-- Order: Child tables first, then parent tables
-- ============================================
PRINT 'Deleting data from tables...';

-- Level 3: Tables with multiple FK dependencies (delete first)
DELETE FROM attendance.EmployeeShifts;
DELETE FROM attendance.ShiftPatternPeriods;
DELETE FROM attendance.WorkingHoursRules;
PRINT '  - Deleted from Level 3 tables';

-- Level 2: Tables with single FK dependencies
DELETE FROM attendance.UserRoles;
DELETE FROM attendance.RolePermissions;
DELETE FROM attendance.Users;
DELETE FROM attendance.DeviceAttendanceLogs;
DELETE FROM attendance.DeviceLogs;
DELETE FROM attendance.LeaveRequests;
DELETE FROM attendance.AttendanceRecords;
PRINT '  - Deleted from Level 2 tables';

-- Level 1: Tables with no FK dependencies (delete last)
DELETE FROM attendance.SystemLogs;
DELETE FROM attendance.CompanyInfo;
DELETE FROM attendance.Units;
DELETE FROM attendance.ShiftPatterns;
DELETE FROM attendance.Shifts;
DELETE FROM attendance.Permissions;
DELETE FROM attendance.Roles;
DELETE FROM attendance.Devices;
DELETE FROM attendance.Employees;
PRINT '  - Deleted from Level 1 tables';

PRINT 'All data deleted successfully.';
GO

-- ============================================
-- STEP 3: RESEED IDENTITY COLUMNS
-- Reset identity values to start from 1
-- ============================================
PRINT 'Reseeding identity columns...';

DBCC CHECKIDENT ('attendance.Employees', RESEED, 0);
DBCC CHECKIDENT ('attendance.AttendanceRecords', RESEED, 0);
DBCC CHECKIDENT ('attendance.LeaveRequests', RESEED, 0);
DBCC CHECKIDENT ('attendance.Devices', RESEED, 0);
DBCC CHECKIDENT ('attendance.DeviceLogs', RESEED, 0);
DBCC CHECKIDENT ('attendance.DeviceAttendanceLogs', RESEED, 0);
DBCC CHECKIDENT ('attendance.SystemLogs', RESEED, 0);
DBCC CHECKIDENT ('attendance.CompanyInfo', RESEED, 0);
DBCC CHECKIDENT ('attendance.Units', RESEED, 0);
DBCC CHECKIDENT ('attendance.Users', RESEED, 0);
DBCC CHECKIDENT ('attendance.Roles', RESEED, 0);
DBCC CHECKIDENT ('attendance.Permissions', RESEED, 0);
DBCC CHECKIDENT ('attendance.RolePermissions', RESEED, 0);
DBCC CHECKIDENT ('attendance.UserRoles', RESEED, 0);
DBCC CHECKIDENT ('attendance.Shifts', RESEED, 0);
DBCC CHECKIDENT ('attendance.ShiftPatterns', RESEED, 0);
DBCC CHECKIDENT ('attendance.ShiftPatternPeriods', RESEED, 0);
DBCC CHECKIDENT ('attendance.WorkingHoursRules', RESEED, 0);
DBCC CHECKIDENT ('attendance.EmployeeShifts', RESEED, 0);

PRINT 'Identity columns reseeded.';
GO

-- ============================================
-- STEP 4: INSERT INITIAL DATA
-- Parent tables first, then child tables
-- Using conditional INSERT to avoid duplicates
-- ============================================
PRINT 'Inserting initial data...';

-- Level 1: Parent tables (no FK dependencies)

-- Insert default company info
IF NOT EXISTS (SELECT 1 FROM attendance.CompanyInfo WHERE ConfigKey = N'default')
BEGIN
    INSERT INTO [attendance].[CompanyInfo] ([ConfigKey], [Name], [WorkStartTime], [WorkEndTime], [LateThreshold])
    VALUES (N'default', N'شرکت نمونه', '08:00', '17:00', '08:15');
    PRINT '  - Inserted CompanyInfo';
END
ELSE
BEGIN
    PRINT '  - CompanyInfo already exists, skipping';
END
GO

-- Insert default units (tree: ست مرکزی is the root; a user may hold roles in several units)
IF NOT EXISTS (SELECT 1 FROM attendance.Units WHERE Name = N'ست مرکزی')
BEGIN
    INSERT INTO [attendance].[Units] ([Name], [Description], [ParentId], [SortOrder])
    VALUES
        (N'ست مرکزی', N'واحد ست مرکزی', NULL, 1);

    INSERT INTO [attendance].[Units] ([Name], [Description], [ParentId], [SortOrder])
    VALUES
        (N'واحد تهران', N'واحد تهران', (SELECT Id FROM [attendance].[Units] WHERE Name = N'ست مرکزی'), 2),
        (N'واحد کاشان', N'واحد کاشان', (SELECT Id FROM [attendance].[Units] WHERE Name = N'ست مرکزی'), 3);
    PRINT '  - Inserted Units';
END
ELSE
BEGIN
    PRINT '  - Units already exist, skipping';
END
GO

-- Insert default system roles
IF NOT EXISTS (SELECT 1 FROM attendance.Roles WHERE Name = N'مدیر سیستم')
BEGIN
    INSERT INTO [attendance].[Roles] ([Name], [Description], [IsSystem])
    VALUES 
        (N'مدیر سیستم', N'دسترسی کامل به تمام بخش‌ها', 1),
        (N'مدیر', N'دسترسی به مدیریت کارکنان و گزارشات', 1),
        (N'کارمند', N'دسترسی به ثبت حضور و مشاهده اطلاعات شخصی', 1);
    PRINT '  - Inserted Roles';
END
ELSE
BEGIN
    PRINT '  - Roles already exist, skipping';
END
GO

-- Insert default permissions
IF NOT EXISTS (SELECT 1 FROM attendance.Permissions)
BEGIN
    INSERT INTO [attendance].[Permissions] ([Name], [Description], [Module], [Action])
    VALUES 
        (N'مشاهده داشبورد', N'دسترسی به صفحه داشبورد', N'dashboard', N'view'),
        (N'مشاهده ثبت حضور', N'دسترسی به صفحه ثبت حضور', N'clock', N'view'),
        (N'ثبت حضور', N'امکان ثبت ساعت ورود و خروج', N'clock', N'create'),
        (N'مشاهده سوابق', N'دسترسی به صفحه سوابق حضور', N'history', N'view'),
        (N'مشاهده کارکنان', N'دسترسی به لیست کارکنان', N'employees', N'view'),
        (N'ایجاد کارمند', N'امکان افزودن کارمند جدید', N'employees', N'create'),
        (N'ویرایش کارمند', N'امکان ویرایش اطلاعات کارمند', N'employees', N'edit'),
        (N'حذف کارمند', N'امکان حذف کارمند', N'employees', N'delete'),
        (N'مشاهده مرخصی‌ها', N'دسترسی به لیست مرخصی‌ها', N'leaves', N'view'),
        (N'درخواست مرخصی', N'امکان ثبت درخواست مرخصی', N'leaves', N'create'),
        (N'تأیید مرخصی', N'امکان تأیید یا رد درخواست مرخصی', N'leaves', N'approve'),
        (N'مشاهده دستگاه‌ها', N'دسترسی به لیست دستگاه‌ها', N'devices', N'view'),
        (N'ایجاد دستگاه', N'امکان افزودن دستگاه جدید', N'devices', N'create'),
        (N'ویرایش دستگاه', N'امکان ویرایش اطلاعات دستگاه', N'devices', N'edit'),
        (N'حذف دستگاه', N'امکان حذف دستگاه', N'devices', N'delete'),
        (N'همگام‌سازی دستگاه', N'امکان همگام‌سازی دستی دستگاه', N'devices', N'sync'),
        (N'مشاهده گزارشات', N'دسترسی به صفحه گزارشات', N'reports', N'view'),
        (N'مشاهده اطلاعات شرکت', N'دسترسی به اطلاعات شرکت', N'company', N'view'),
        (N'ویرایش اطلاعات شرکت', N'امکان ویرایش اطلاعات شرکت', N'company', N'edit'),
        (N'مشاهده کاربران', N'دسترسی به لیست کاربران', N'users', N'view'),
        (N'ایجاد کاربر', N'امکان افزودن کاربر جدید', N'users', N'create'),
        (N'ویرایش کاربر', N'امکان ویرایش اطلاعات کاربر', N'users', N'edit'),
        (N'حذف کاربر', N'امکان حذف کاربر', N'users', N'delete'),
        (N'مشاهده پنل مدیریت', N'دسترسی به پنل مدیریت', N'admin', N'view'),
        (N'مشاهده لاگ‌ها', N'دسترسی به لاگ‌های سیستم', N'admin', N'logs');
    PRINT '  - Inserted Permissions';
END
ELSE
BEGIN
    PRINT '  - Permissions already exist, skipping';
END
GO

-- Insert default shifts
IF NOT EXISTS (SELECT 1 FROM attendance.Shifts)
BEGIN
    INSERT INTO [attendance].[Shifts] ([Name], [Description], [StartTime], [EndTime], [BreakStartTime], [BreakEndTime], [LateThresholdMinutes], [Color])
    VALUES 
        (N'شیفت صبح', N'شیفت معمولی صبح', '08:00:00', '17:00:00', '12:00:00', '13:00:00', 15, '#10B981'),
        (N'شیفت عصر', N'شیفت عصر', '14:00:00', '22:00:00', '18:00:00', '18:30:00', 15, '#F59E0B'),
        (N'شیفت شب', N'شیفت شب', '22:00:00', '06:00:00', '02:00:00', '02:30:00', 15, '#8B5CF6'),
        (N'شیفت پاره‌وقت', N'شیفت پاره‌وقت 5 ساعته', '09:00:00', '14:00:00', NULL, NULL, 10, '#3B82F6');
    PRINT '  - Inserted Shifts';
END
ELSE
BEGIN
    PRINT '  - Shifts already exist, skipping';
END
GO

-- Insert default shift patterns
IF NOT EXISTS (SELECT 1 FROM attendance.ShiftPatterns)
BEGIN
    INSERT INTO [attendance].[ShiftPatterns] ([Name], [Description], [TotalCycleHours])
    VALUES 
        (N'24 ساعت کار / 36 ساعت استراحت', N'الگوی شیفت چرخشی 24 ساعت کار و 36 ساعت استراحت', 60),
        (N'12 ساعت کار / 24 ساعت استراحت', N'الگوی شیفت چرخشی 12 ساعت کار و 24 ساعت استراحت', 36);
    PRINT '  - Inserted ShiftPatterns';
END
ELSE
BEGIN
    PRINT '  - ShiftPatterns already exist, skipping';
END
GO

-- Level 2: Child tables (have FK dependencies)

-- Insert default admin user
IF NOT EXISTS (SELECT 1 FROM attendance.Users WHERE Username = N'admin')
BEGIN
    INSERT INTO [attendance].[Users] ([Username], [PasswordHash], [Email], [Role], [IsActive])
    VALUES (N'admin', N'$2b$10$placeholder_hash_will_be_replaced', N'admin@company.com', N'admin', 1);
    PRINT '  - Inserted Users';
END
ELSE
BEGIN
    PRINT '  - Users already exist, skipping';
END
GO

-- Assign all permissions to admin role
IF NOT EXISTS (SELECT 1 FROM attendance.RolePermissions rp
                     INNER JOIN attendance.Roles r ON rp.RoleId = r.Id
                     WHERE r.Name = N'مدیر سیستم')
BEGIN
    INSERT INTO [attendance].[RolePermissions] ([RoleId], [PermissionId])
    SELECT r.[Id], p.[Id]
    FROM [attendance].[Permissions] p
    CROSS JOIN [attendance].[Roles] r
    WHERE r.Name = N'مدیر سیستم';
    PRINT '  - Inserted RolePermissions for admin';
END
ELSE
BEGIN
    PRINT '  - RolePermissions for admin already exist, skipping';
END
GO

-- Assign admin role to admin user
IF NOT EXISTS (SELECT 1 FROM attendance.UserRoles ur
                     INNER JOIN attendance.Users u ON ur.UserId = u.Id
                     INNER JOIN attendance.Roles r ON ur.RoleId = r.Id
                     WHERE u.Username = N'admin' AND r.Name = N'مدیر سیستم')
BEGIN
    INSERT INTO [attendance].[UserRoles] ([UserId], [RoleId], [UnitId], [IsPrimary])
    SELECT u.[Id], r.[Id], NULL, 1
    FROM [attendance].[Users] u
    CROSS JOIN [attendance].[Roles] r
    WHERE u.Username = N'admin' AND r.Name = N'مدیر سیستم';
    PRINT '  - Inserted UserRoles for admin';
END
ELSE
BEGIN
    PRINT '  - UserRoles for admin already exist, skipping';
END
GO

-- Insert pattern periods for 24/36 pattern
IF NOT EXISTS (SELECT 1 FROM attendance.ShiftPatternPeriods spp
                     INNER JOIN attendance.ShiftPatterns sp ON spp.PatternId = sp.Id
                     WHERE sp.Name LIKE N'24%')
BEGIN
    INSERT INTO [attendance].[ShiftPatternPeriods] ([PatternId], [PeriodOrder], [PeriodType], [DurationHours], [ShiftId], [Description])
    VALUES 
        (NEWID(), N'pattern-24-36', 1, N'work', 24, N'shift-morning', N'دوره کاری 24 ساعته'),
        (NEWID(), N'pattern-24-36', 2, N'rest', 36, NULL, N'دوره استراحت 36 ساعته');
    PRINT '  - Inserted ShiftPatternPeriods for 24/36';
END
ELSE
BEGIN
    PRINT '  - ShiftPatternPeriods for 24/36 already exist, skipping';
END
GO

-- Insert pattern periods for 12/24 pattern
IF NOT EXISTS (SELECT 1 FROM attendance.ShiftPatternPeriods spp
                     INNER JOIN attendance.ShiftPatterns sp ON spp.PatternId = sp.Id
                     WHERE sp.Name LIKE N'12%')
BEGIN
    INSERT INTO [attendance].[ShiftPatternPeriods] ([PatternId], [PeriodOrder], [PeriodType], [DurationHours], [ShiftId], [Description])
    VALUES 
        (NEWID(), N'pattern-12-24', 1, N'work', 12, N'shift-morning', N'دوره کاری 12 ساعته'),
        (NEWID(), N'pattern-12-24', 2, N'rest', 24, NULL, N'دوره استراحت 24 ساعته');
    PRINT '  - Inserted ShiftPatternPeriods for 12/24';
END
ELSE
BEGIN
    PRINT '  - ShiftPatternPeriods for 12/24 already exist, skipping';
END
GO

-- Insert default working hours rules
IF NOT EXISTS (SELECT 1 FROM attendance.WorkingHoursRules)
BEGIN
    INSERT INTO [attendance].[WorkingHoursRules] ([Name], [RuleType], [DayOfWeek], [IsWorkingDay], [Description])
    VALUES (N'جمعه', N'weekend', 6, 0, N'روز تعطیل هفته');
    PRINT '  - Inserted WorkingHoursRules';
END
ELSE
BEGIN
    PRINT '  - WorkingHoursRules already exist, skipping';
END
GO

-- ============================================
-- STEP 5: RE-ENABLE ALL FOREIGN KEY CONSTRAINTS
-- ============================================
PRINT 'Re-enabling foreign key constraints...';

DECLARE @sql2 NVARCHAR(MAX) = '';
SELECT @sql2 = @sql2 + 'ALTER TABLE attendance.' + QUOTENAME(t.name) + ' WITH CHECK CHECK CONSTRAINT ALL;' + CHAR(13)
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'attendance';

EXEC sp_executesql @sql2;
PRINT 'Foreign key constraints re-enabled.';
GO

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
PRINT '';
PRINT '========================================';
PRINT 'Database cleaned and initialized!';
PRINT '========================================';
PRINT '';
PRINT 'Schema: attendance';
PRINT '';
PRINT 'All tables cleaned and initial data inserted:';
PRINT '- 1 Company Info';
PRINT '- 1 Admin User (username: admin)';
PRINT '- 3 System Roles';
PRINT '- 25 Permissions';
PRINT '- 4 Default Shifts';
PRINT '- 1 Working Hours Rule (Friday)';
PRINT '- 2 Shift Patterns';
PRINT '';
PRINT 'Next steps:';
PRINT '1. Run seed-admin.mjs to set admin password';
PRINT '2. Start the server: npm run server';
PRINT '3. Login with admin/admin123';
PRINT '========================================';
GO
