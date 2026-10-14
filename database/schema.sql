-- ============================================
-- SQL Server Database Schema for Attendance System
-- Using 'attendance' schema
-- ============================================

-- Create Database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'AttendanceDB')
BEGIN
    CREATE DATABASE AttendanceDB;
END
GO

USE AttendanceDB;
GO

-- Create attendance schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'attendance')
BEGIN
    EXEC('CREATE SCHEMA attendance');
END
GO

-- ============================================
-- CREATE TABLES
-- ============================================

-- Create Employees Table
CREATE TABLE [attendance].[Employees] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL,
    [PersonnelCode] NVARCHAR(20) NOT NULL UNIQUE,
    [Department] NVARCHAR(100) NOT NULL,
    [Position] NVARCHAR(100) NOT NULL,
    [Avatar] NVARCHAR(255) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create Attendance Records Table
CREATE TABLE [attendance].[AttendanceRecords] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [EmployeeId] INT NOT NULL,
    [Date] NVARCHAR(10) NOT NULL,
    [ClockIn] NVARCHAR(5) NULL,
    [ClockOut] NVARCHAR(5) NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('present', 'absent', 'late', 'leave', 'holiday')),
    [Note] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_AttendanceRecords_Employees] FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE
);
GO

-- Create Leave Requests Table
CREATE TABLE [attendance].[LeaveRequests] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [EmployeeId] INT NOT NULL,
    [StartDate] NVARCHAR(10) NOT NULL,
    [EndDate] NVARCHAR(10) NOT NULL,
    [Type] NVARCHAR(20) NOT NULL CHECK ([Type] IN ('sick', 'annual', 'personal', 'unpaid')),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('pending', 'approved', 'rejected')),
    [Description] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_LeaveRequests_Employees] FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE
);
GO

-- Create Devices Table
CREATE TABLE [attendance].[Devices] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL CHECK ([Type] IN ('fingerprint', 'face', 'card', 'mixed')),
    [Model] NVARCHAR(100) NOT NULL,
    [ModelId] NVARCHAR(50) NULL,
    [IPAddress] NVARCHAR(50) NULL,
    [Port] INT NULL,
    [SerialNumber] NVARCHAR(100) NULL,
    [Protocol] NVARCHAR(50) NOT NULL CHECK ([Protocol] IN ('http', 'http-push', 'tcp', 'mqtt', 'zk', 'isapi', 'dws', 'fpvtech', 'controlianz', 'suprema', 'biostar2', 'sdk600', 'wiegand-gateway', 'realtime', 'smartplus', 'apex', 'crosschex', 'essl-pull', 'pullsdk', 'telnet', 'websockets', 'custom', 'virdi', 'trustone', 'tosan', 'cmitech')),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('active', 'inactive', 'error', 'maintenance')),
    [Location] NVARCHAR(200) NULL,
    [LastSync] DATETIME NULL,
    [LastSeen] DATETIME NULL,
    [LastError] NVARCHAR(500) NULL,
    [LastErrorCode] NVARCHAR(50) NULL,
    [ConsecutiveFailures] INT NOT NULL DEFAULT 0,
    [TotalRecordsReceived] INT NOT NULL DEFAULT 0,
    [PollingInterval] INT DEFAULT 60,
    [WebhookEnabled] BIT DEFAULT 0,
    [WebhookURL] NVARCHAR(500) NULL,
    [Config] NVARCHAR(MAX) NULL,
    -- Soft delete: removing a device never deletes its attendance logs physically.
    [isDeleted] BIT NOT NULL DEFAULT 0,
    [deletedAt] DATETIME NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create Device Logs Table
CREATE TABLE [attendance].[DeviceLogs] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [DeviceId] INT NOT NULL,
    [EventType] NVARCHAR(50) NOT NULL CHECK ([EventType] IN ('sync', 'error', 'connection', 'disconnection', 'config_change')),
    [Message] NVARCHAR(MAX) NULL,
    [Data] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_DeviceLogs_Devices] FOREIGN KEY ([DeviceId]) REFERENCES [attendance].[Devices]([Id]) ON DELETE CASCADE
);
GO

-- Create Device Attendance Logs Table
CREATE TABLE [attendance].[DeviceAttendanceLogs] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [DeviceId] INT NOT NULL,
    [EmployeeId] INT NULL,
    [DeviceUserId] NVARCHAR(100) NULL,
    [Timestamp] DATETIME NOT NULL,
    [EventType] NVARCHAR(20) NOT NULL CHECK ([EventType] IN ('checkin', 'checkout')),
    [VerificationMethod] NVARCHAR(50) NULL,
    [RawData] NVARCHAR(MAX) NULL,
    [Processed] BIT DEFAULT 0,
    [ProcessedAt] DATETIME NULL,
    [AttendanceRecordId] INT NULL,
    -- Set only when the punch was ingested by a device poller/webhook (not manual entry).
    [Source] NVARCHAR(20) NULL DEFAULT 'manual',
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_DeviceAttendanceLogs_Devices] FOREIGN KEY ([DeviceId]) REFERENCES [attendance].[Devices]([Id]) ON DELETE CASCADE
);
GO

-- Create System Logs Table
CREATE TABLE [attendance].[SystemLogs] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Level] NVARCHAR(20) NOT NULL CHECK ([Level] IN ('info', 'success', 'warning', 'error')),
    [Action] NVARCHAR(50) NOT NULL,
    [Entity] NVARCHAR(50) NOT NULL,
    [EntityId] INT NULL,
    [Message] NVARCHAR(MAX) NULL,
    [Metadata] NVARCHAR(MAX) NULL,
    [UserId] INT NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create Company Info Table
CREATE TABLE [attendance].[CompanyInfo] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [ConfigKey] NVARCHAR(50) NOT NULL DEFAULT 'default' UNIQUE,
    [Name] NVARCHAR(200) NOT NULL,
    [Logo] NVARCHAR(500) NULL,
    [Address] NVARCHAR(500) NULL,
    [Phone] NVARCHAR(50) NULL,
    [Email] NVARCHAR(200) NULL,
    [Website] NVARCHAR(200) NULL,
    [WorkStartTime] NVARCHAR(10) DEFAULT '08:00',
    [WorkEndTime] NVARCHAR(10) DEFAULT '17:00',
    [LateThreshold] NVARCHAR(10) DEFAULT '08:15',
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create Units Table (organizational unit tree; a user may hold roles in several units)
CREATE TABLE [attendance].[Units] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL UNIQUE,
    [Description] NVARCHAR(500) NULL,
    [ParentId] INT NULL,
    [SortOrder] INT DEFAULT 0,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_Units_ParentUnit] FOREIGN KEY ([ParentId]) REFERENCES [attendance].[Units]([Id])
);
GO

-- Create Users Table
CREATE TABLE [attendance].[Users] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [EmployeeId] INT NULL,
    [Username] NVARCHAR(100) NOT NULL UNIQUE,
    [PasswordHash] NVARCHAR(500) NOT NULL,
    [Email] NVARCHAR(200) NULL,
    -- Primary role code ('admin' | 'manager' | 'employee'); the full picture of a
    -- user's access lives in attendance.UserRoles (role + unit assignments).
    [Role] NVARCHAR(50) NOT NULL DEFAULT 'employee',
    [IsActive] BIT DEFAULT 1,
    [LastLogin] DATETIME NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_Users_Employees] FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]) ON DELETE SET NULL
);
GO

-- Create Roles Table (hierarchical: ParentId forms the role tree)
CREATE TABLE [attendance].[Roles] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL UNIQUE,
    [Description] NVARCHAR(500) NULL,
    [ParentId] INT NULL,
    [SortOrder] INT DEFAULT 0,
    [IsSystem] BIT DEFAULT 0,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_Roles_ParentRole] FOREIGN KEY ([ParentId]) REFERENCES [attendance].[Roles]([Id])
);
GO

-- Create Permissions Table (hierarchical: ParentId forms the permission tree,
-- e.g. module root -> entity -> action; children inherit their parent's grant)
CREATE TABLE [attendance].[Permissions] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL UNIQUE,
    [Description] NVARCHAR(500) NULL,
    [Module] NVARCHAR(50) NOT NULL,
    [Action] NVARCHAR(50) NOT NULL,
    [ParentId] INT NULL,
    [SortOrder] INT DEFAULT 0,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_Permissions_ParentPermission] FOREIGN KEY ([ParentId]) REFERENCES [attendance].[Permissions]([Id])
);
GO

-- Create RolePermissions Table
CREATE TABLE [attendance].[RolePermissions] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [RoleId] INT NOT NULL,
    [PermissionId] INT NOT NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_RolePermissions_Roles] FOREIGN KEY ([RoleId]) REFERENCES [attendance].[Roles]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_RolePermissions_Permissions] FOREIGN KEY ([PermissionId]) REFERENCES [attendance].[Permissions]([Id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_RolePermissions] UNIQUE ([RoleId], [PermissionId])
);
GO

-- Create UserRoles Table
-- A user can hold MULTIPLE roles, each optionally scoped to an organizational unit.
-- UnitId = NULL  -> the assignment is global (valid in every unit)
-- UnitId = <id>  -> the role applies only inside that unit
CREATE TABLE [attendance].[UserRoles] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [UserId] INT NOT NULL,
    [RoleId] INT NOT NULL,
    [UnitId] INT NULL,
    [IsPrimary] BIT DEFAULT 0,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_UserRoles_Users] FOREIGN KEY ([UserId]) REFERENCES [attendance].[Users]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_UserRoles_Roles] FOREIGN KEY ([RoleId]) REFERENCES [attendance].[Roles]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_UserRoles_Units] FOREIGN KEY ([UnitId]) REFERENCES [attendance].[Units]([Id]) ON DELETE SET NULL,
    -- same role+unit pair cannot be assigned twice; SQL Server treats NULLs as
    -- distinct in unique keys, so the global (UnitId IS NULL) case is enforced
    -- by a filtered unique index below
    CONSTRAINT [UQ_UserRoles_PerUnit] UNIQUE ([UserId], [RoleId], [UnitId])
);
GO

-- Enforce uniqueness for global (unit-less) assignments: one row per user+role with NULL unit
CREATE UNIQUE INDEX [UQ_UserRoles_Global] ON [attendance].[UserRoles] ([UserId], [RoleId]) WHERE [UnitId] IS NULL;
GO

-- Create Shifts Table
CREATE TABLE [attendance].[Shifts] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(500) NULL,
    [StartTime] TIME NOT NULL,
    [EndTime] TIME NOT NULL,
    [BreakStartTime] TIME NULL,
    [BreakEndTime] TIME NULL,
    [LateThresholdMinutes] INT DEFAULT 15,
    [EarlyLeaveThresholdMinutes] INT DEFAULT 15,
    [IsActive] BIT DEFAULT 1,
    [Color] NVARCHAR(20) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create ShiftPatterns Table
CREATE TABLE [attendance].[ShiftPatterns] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(500) NULL,
    [TotalCycleHours] INT NOT NULL,
    [IsActive] BIT DEFAULT 1,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE()
);
GO

-- Create ShiftPatternPeriods Table
CREATE TABLE [attendance].[ShiftPatternPeriods] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [PatternId] INT NOT NULL,
    [PeriodOrder] INT NOT NULL,
    [PeriodType] NVARCHAR(20) NOT NULL CHECK ([PeriodType] IN ('work', 'rest', 'break')),
    [DurationHours] INT NOT NULL,
    [ShiftId] INT NULL,
    [Description] NVARCHAR(200) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_ShiftPatternPeriods_Patterns] FOREIGN KEY ([PatternId]) REFERENCES [attendance].[ShiftPatterns]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ShiftPatternPeriods_Shifts] FOREIGN KEY ([ShiftId]) REFERENCES [attendance].[Shifts]([Id]) ON DELETE SET NULL
);
GO

-- Create WorkingHoursRules Table
CREATE TABLE [attendance].[WorkingHoursRules] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Name] NVARCHAR(100) NOT NULL,
    [RuleType] NVARCHAR(50) NOT NULL CHECK ([RuleType] IN ('holiday', 'weekend', 'overtime', 'special_day')),
    [StartDate] NVARCHAR(10) NULL,
    [EndDate] NVARCHAR(10) NULL,
    [DayOfWeek] INT NULL,
    [IsWorkingDay] BIT DEFAULT 0,
    [ShiftId] INT NULL,
    [OvertimeMultiplier] DECIMAL(3,2) NULL,
    [Description] NVARCHAR(500) NULL,
    [IsActive] BIT DEFAULT 1,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_WorkingHoursRules_Shifts] FOREIGN KEY ([ShiftId]) REFERENCES [attendance].[Shifts]([Id]) ON DELETE SET NULL
);
GO

-- Create EmployeeShifts Table
CREATE TABLE [attendance].[EmployeeShifts] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [EmployeeId] INT NOT NULL,
    [ShiftId] INT NULL,
    [PatternId] INT NULL,
    [PatternStartDate] DATETIME NULL,
    [StartDate] NVARCHAR(10) NOT NULL,
    [EndDate] NVARCHAR(10) NULL,
    [DaysOfWeek] NVARCHAR(50) NULL,
    [IsActive] BIT DEFAULT 1,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_EmployeeShifts_Employees] FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_EmployeeShifts_Shifts] FOREIGN KEY ([ShiftId]) REFERENCES [attendance].[Shifts]([Id]) ON DELETE SET NULL,
    CONSTRAINT [FK_EmployeeShifts_Patterns] FOREIGN KEY ([PatternId]) REFERENCES [attendance].[ShiftPatterns]([Id]) ON DELETE SET NULL
);
GO

-- ============================================
-- CREATE INDEXES
-- ============================================

CREATE INDEX [IX_AttendanceRecords_Date] ON [attendance].[AttendanceRecords] ([Date]);
CREATE INDEX [IX_AttendanceRecords_EmployeeId] ON [attendance].[AttendanceRecords] ([EmployeeId]);
CREATE INDEX [IX_LeaveRequests_EmployeeId] ON [attendance].[LeaveRequests] ([EmployeeId]);
CREATE INDEX [IX_DeviceLogs_DeviceId] ON [attendance].[DeviceLogs] ([DeviceId]);
CREATE INDEX [IX_DeviceAttendanceLogs_DeviceId] ON [attendance].[DeviceAttendanceLogs] ([DeviceId]);
CREATE INDEX [IX_DeviceAttendanceLogs_Timestamp] ON [attendance].[DeviceAttendanceLogs] ([Timestamp]);
CREATE INDEX [IX_SystemLogs_Level] ON [attendance].[SystemLogs] ([Level]);
CREATE INDEX [IX_SystemLogs_Entity] ON [attendance].[SystemLogs] ([Entity]);
CREATE INDEX [IX_SystemLogs_CreatedAt] ON [attendance].[SystemLogs] ([CreatedAt] DESC);
CREATE INDEX [IX_Users_Username] ON [attendance].[Users] ([Username]);
CREATE INDEX [IX_Users_EmployeeId] ON [attendance].[Users] ([EmployeeId]);
CREATE INDEX [IX_RolePermissions_RoleId] ON [attendance].[RolePermissions] ([RoleId]);
CREATE INDEX [IX_RolePermissions_PermissionId] ON [attendance].[RolePermissions] ([PermissionId]);
CREATE INDEX [IX_UserRoles_UserId] ON [attendance].[UserRoles] ([UserId]);
CREATE INDEX [IX_UserRoles_RoleId] ON [attendance].[UserRoles] ([RoleId]);
CREATE INDEX [IX_UserRoles_UnitId] ON [attendance].[UserRoles] ([UnitId]);
CREATE INDEX [IX_Units_Name] ON [attendance].[Units] ([Name]);
CREATE INDEX [IX_Units_ParentId] ON [attendance].[Units] ([ParentId]);
CREATE INDEX [IX_EmployeeShifts_EmployeeId] ON [attendance].[EmployeeShifts] ([EmployeeId]);
CREATE INDEX [IX_EmployeeShifts_ShiftId] ON [attendance].[EmployeeShifts] ([ShiftId]);
CREATE INDEX [IX_EmployeeShifts_PatternId] ON [attendance].[EmployeeShifts] ([PatternId]);
CREATE INDEX [IX_WorkingHoursRules_RuleType] ON [attendance].[WorkingHoursRules] ([RuleType]);
CREATE INDEX [IX_ShiftPatternPeriods_PatternId] ON [attendance].[ShiftPatternPeriods] ([PatternId]);
GO

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Insert default company info
INSERT INTO [attendance].[CompanyInfo] ([ConfigKey], [Name], [WorkStartTime], [WorkEndTime], [LateThreshold])
VALUES (N'default', N'شرکت نمونه', '08:00', '17:00', '08:15');
GO

-- Insert default units (tree: ست مرکزی is the root; a user may hold roles in several units)
INSERT INTO [attendance].[Units] ([Name], [Description], [ParentId], [SortOrder])
VALUES
    (N'ست مرکزی', N'واحد ست مرکزی', NULL, 1),
    (N'واحد تهران', N'واحد تهران', 1, 2),
    (N'واحد کاشان', N'واحد کاشان', 1, 3);
GO

-- Insert default admin user
INSERT INTO [attendance].[Users] ([Username], [PasswordHash], [Email], [Role], [IsActive])
VALUES (N'admin', N'$2b$10$placeholder_hash_will_be_replaced', N'admin@company.com', N'admin', 1);
GO

-- Insert default system roles
INSERT INTO [attendance].[Roles] ([Name], [Description], [IsSystem])
VALUES 
    (N'مدیر سیستم', N'دسترسی کامل به تمام بخش‌ها', 1),
    (N'مدیر', N'دسترسی به مدیریت کارکنان و گزارشات', 1),
    (N'کارمند', N'دسترسی به ثبت حضور و مشاهده اطلاعات شخصی', 1);
GO

-- Insert default permissions as a TREE:
--   root (module, Action='*')  ->  leaf (action)
-- Granting a root node implies granting all of its descendants (expanded server-side).
SET IDENTITY_INSERT [attendance].[Permissions] ON;

INSERT INTO [attendance].[Permissions] ([Id], [Name], [Description], [Module], [Action], [ParentId], [SortOrder])
VALUES
    -- roots
    (1,  N'دسترسی کامل داشبورد', N'کل ماژول داشبورد', N'dashboard', N'*', NULL, 1),
    (2,  N'دسترسی کامل ثبت حضور', N'کل ماژول ثبت حضور', N'clock', N'*', NULL, 2),
    (3,  N'دسترسی کامل سوابق', N'کل ماژول سوابق حضور', N'history', N'*', NULL, 3),
    (4,  N'دسترسی کامل کارکنان', N'کل ماژول کارکنان', N'employees', N'*', NULL, 4),
    (5,  N'دسترسی کامل مرخصی‌ها', N'کل ماژول مرخصی‌ها', N'leaves', N'*', NULL, 5),
    (6,  N'دسترسی کامل دستگاه‌ها', N'کل ماژول دستگاه‌ها', N'devices', N'*', NULL, 6),
    (7,  N'دسترسی کامل گزارشات', N'کل ماژول گزارشات', N'reports', N'*', NULL, 7),
    (8,  N'دسترسی کامل اطلاعات شرکت', N'کل ماژول اطلاعات شرکت', N'company', N'*', NULL, 8),
    (9,  N'دسترسی کامل کاربران', N'کل ماژول کاربران', N'users', N'*', NULL, 9),
    (10, N'دسترسی کامل پنل مدیریت', N'کل ماژول مدیریت', N'admin', N'*', NULL, 10),
    -- leaves
    (11, N'مشاهده داشبورد', N'دسترسی به صفحه داشبورد', N'dashboard', N'view', 1, 1),
    (12, N'مشاهده ثبت حضور', N'دسترسی به صفحه ثبت حضور', N'clock', N'view', 2, 1),
    (13, N'ثبت حضور', N'امکان ثبت ساعت ورود و خروج', N'clock', N'create', 2, 2),
    (14, N'مشاهده سوابق', N'دسترسی به صفحه سوابق حضور', N'history', N'view', 3, 1),
    (15, N'مشاهده کارکنان', N'دسترسی به لیست کارکنان', N'employees', N'view', 4, 1),
    (16, N'ایجاد کارمند', N'امکان افزودن کارمند جدید', N'employees', N'create', 4, 2),
    (17, N'ویرایش کارمند', N'امکان ویرایش اطلاعات کارمند', N'employees', N'edit', 4, 3),
    (18, N'حذف کارمند', N'امکان حذف کارمند', N'employees', N'delete', 4, 4),
    (19, N'مشاهده مرخصی‌ها', N'دسترسی به لیست مرخصی‌ها', N'leaves', N'view', 5, 1),
    (20, N'درخواست مرخصی', N'امکان ثبت درخواست مرخصی', N'leaves', N'create', 5, 2),
    (21, N'تأیید مرخصی', N'امکان تأیید یا رد درخواست مرخصی', N'leaves', N'approve', 5, 3),
    (22, N'مشاهده دستگاه‌ها', N'دسترسی به لیست دستگاه‌ها', N'devices', N'view', 6, 1),
    (23, N'ایجاد دستگاه', N'امکان افزودن دستگاه جدید', N'devices', N'create', 6, 2),
    (24, N'ویرایش دستگاه', N'امکان ویرایش اطلاعات دستگاه', N'devices', N'edit', 6, 3),
    (25, N'حذف دستگاه', N'امکان حذف دستگاه', N'devices', N'delete', 6, 4),
    (26, N'همگام‌سازی دستگاه', N'امکان همگام‌سازی دستی دستگاه', N'devices', N'sync', 6, 5),
    (36, N'مشاهده زنده تردد دستگاه‌ها', N'دسترسی به فید زنده (SSE) رویدادهای دستگاه‌ها', N'devices', N'realtime', 6, 6),
    (27, N'مشاهده گزارشات', N'دسترسی به صفحه گزارشات', N'reports', N'view', 7, 1),
    (28, N'مشاهده اطلاعات شرکت', N'دسترسی به اطلاعات شرکت', N'company', N'view', 8, 1),
    (29, N'ویرایش اطلاعات شرکت', N'امکان ویرایش اطلاعات شرکت', N'company', N'edit', 8, 2),
    (30, N'مشاهده کاربران', N'دسترسی به لیست کاربران', N'users', N'view', 9, 1),
    (31, N'ایجاد کاربر', N'امکان افزودن کاربر جدید', N'users', N'create', 9, 2),
    (32, N'ویرایش کاربر', N'امکان ویرایش اطلاعات کاربر', N'users', N'edit', 9, 3),
    (33, N'حذف کاربر', N'امکان حذف کاربر', N'users', N'delete', 9, 4),
    (34, N'مشاهده پنل مدیریت', N'دسترسی به پنل مدیریت', N'admin', N'view', 10, 1),
    (35, N'مشاهده لاگ‌ها', N'دسترسی به لاگ‌های سیستم', N'admin', N'logs', 10, 2);

SET IDENTITY_INSERT [attendance].[Permissions] OFF;
GO

-- Role tree: مدیر سیستم -> مدیر -> کارمند (child roles inherit parent grants)
UPDATE [attendance].[Roles] SET [ParentId] = 1 WHERE [Name] = N'مدیر';
UPDATE [attendance].[Roles] SET [ParentId] = 2 WHERE [Name] = N'کارمند';
GO

-- Assign all permissions to admin role
INSERT INTO [attendance].[RolePermissions] ([RoleId], [PermissionId])
SELECT r.[Id], p.[Id]
FROM [attendance].[Permissions] p
CROSS JOIN [attendance].[Roles] r
WHERE r.[Name] = N'مدیر سیستم';

-- Assign admin role to admin user (global assignment: UnitId NULL, marked primary)
INSERT INTO [attendance].[UserRoles] ([UserId], [RoleId], [UnitId], [IsPrimary])
SELECT u.[Id], r.[Id], NULL, 1
FROM [attendance].[Users] u
CROSS JOIN [attendance].[Roles] r
WHERE u.[Username] = N'admin' AND r.[Name] = N'مدیر سیستم';
GO

-- Insert default shifts
INSERT INTO [attendance].[Shifts] ([Name], [Description], [StartTime], [EndTime], [BreakStartTime], [BreakEndTime], [LateThresholdMinutes], [Color])
VALUES 
    (N'شیفت صبح', N'شیفت معمولی صبح', '08:00:00', '17:00:00', '12:00:00', '13:00:00', 15, '#10B981'),
    (N'شیفت عصر', N'شیفت عصر', '14:00:00', '22:00:00', '18:00:00', '18:30:00', 15, '#F59E0B'),
    (N'شیفت شب', N'شیفت شب', '22:00:00', '06:00:00', '02:00:00', '02:30:00', 15, '#8B5CF6'),
    (N'شیفت پاره‌وقت', N'شیفت پاره‌وقت 5 ساعته', '09:00:00', '14:00:00', NULL, NULL, 10, '#3B82F6');
GO

-- Insert default working hours rules
INSERT INTO [attendance].[WorkingHoursRules] ([Name], [RuleType], [DayOfWeek], [IsWorkingDay], [Description])
VALUES ( N'جمعه', N'weekend', 6, 0, N'روز تعطیل هفته');
GO

-- Insert default shift patterns
INSERT INTO [attendance].[ShiftPatterns] ([Name], [Description], [TotalCycleHours])
VALUES 
    (N'24 ساعت کار / 36 ساعت استراحت', N'الگوی شیفت چرخشی 24 ساعت کار و 36 ساعت استراحت', 60),
    (N'12 ساعت کار / 24 ساعت استراحت', N'الگوی شیفت چرخشی 12 ساعت کار و 24 ساعت استراحت', 36);
GO

-- ============================================
-- CREATE STORED PROCEDURES
-- ============================================

CREATE PROCEDURE [attendance].[GetAttendanceByDateAndEmployee]
    @Date NVARCHAR(10),
    @EmployeeId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [attendance].[AttendanceRecords]
    WHERE [Date] = @Date AND [EmployeeId] = @EmployeeId;
END
GO

CREATE PROCEDURE [attendance].[GetMonthlyStatistics]
    @Month NVARCHAR(7)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        e.[Department],
        COUNT(DISTINCT e.[Id]) AS [TotalEmployees],
        COUNT(CASE WHEN ar.[Status] = 'present' THEN 1 END) AS [PresentDays],
        COUNT(CASE WHEN ar.[Status] = 'late' THEN 1 END) AS [LateDays],
        COUNT(CASE WHEN ar.[Status] = 'absent' THEN 1 END) AS [AbsentDays]
    FROM [attendance].[Employees] e
    LEFT JOIN [attendance].[AttendanceRecords] ar ON e.[Id] = ar.[EmployeeId] AND ar.[Date] LIKE @Month + '%'
    GROUP BY e.[Department];
END
GO

-- ============================================
-- The sections below mirror database/migrations/*.sql in filename order.
-- Fresh install == migrated production install. The boot-time runner
-- (server/services/migrate.mjs) also applies these idempotently; this
-- dump exists so schema.sql alone produces an up-to-date database.
-- ============================================

-- ---------- 001-device-catalog.sql ----------
-- Migration 001: device catalog support (ModelId column + extended Protocol list)
-- Run against the existing database; safe to re-run.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Devices') AND name = 'ModelId')
BEGIN
    ALTER TABLE attendance.Devices ADD [ModelId] NVARCHAR(50) NULL;
END
GO
-- Replace the Protocol CHECK constraint with the extended protocol set
DECLARE @conName NVARCHAR(200);
SELECT @conName = dc.name
FROM sys.check_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('attendance.Devices') AND c.name = 'Protocol';

IF @conName IS NOT NULL
    EXEC('ALTER TABLE attendance.Devices DROP CONSTRAINT [' + @conName + ']');
GO
ALTER TABLE attendance.Devices
    ADD CONSTRAINT CK_Devices_Protocol CHECK ([Protocol] IN
        ('http', 'http-push', 'tcp', 'mqtt', 'zk', 'isapi', 'dws', 'fpvtech',
         'controlianz', 'suprema', 'biostar2', 'sdk600', 'wiegand-gateway',
         'realtime', 'smartplus', 'apex', 'crosschex', 'essl-pull', 'pullsdk',
         'telnet', 'websockets', 'custom'));
GO

-- ---------- 002-device-monitoring.sql ----------
-- Migration 002: device monitoring columns on attendance.Devices
-- Adds health-check / reachability fields used by the "پایش دستگاه‌ها" section.
-- Safe to run repeatedly (IF NOT EXISTS guards).

IF COL_LENGTH('attendance.Devices', 'LastSeen') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastSeen] DATETIME NULL;
GO
IF COL_LENGTH('attendance.Devices', 'LastError') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastError] NVARCHAR(500) NULL;
GO
IF COL_LENGTH('attendance.Devices', 'LastErrorCode') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastErrorCode] NVARCHAR(50) NULL;
GO
IF COL_LENGTH('attendance.Devices', 'ConsecutiveFailures') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [ConsecutiveFailures] INT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('attendance.Devices', 'TotalRecordsReceived') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [TotalRecordsReceived] INT NOT NULL DEFAULT 0;
GO

-- ---------- 003-device-soft-delete.sql ----------
-- Migration 003: soft-delete columns on attendance.Devices
-- Deleting a device only marks it (IsDeleted = 1); its DeviceAttendanceLogs
-- and DeviceLogs rows are kept forever for audit/history.

IF COL_LENGTH('attendance.Devices', 'isDeleted') IS NULL
    ALTER TABLE attendance.Devices ADD [isDeleted] BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('attendance.Devices', 'DeletedAt') IS NULL
    ALTER TABLE attendance.Devices ADD [DeletedAt] DATETIME NULL;
GO
-- Speed up the "exclude deleted" filter used by every device query.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Devices_isDeleted' AND object_id = OBJECT_ID('attendance.Devices'))
    CREATE INDEX IX_Devices_isDeleted ON attendance.Devices ([isDeleted]);
GO
PRINT 'Migration 003 (device soft delete) applied.';
GO

-- ---------- 003-realtime-stream.sql ----------
-- Migration 003: realtime device stream support
-- 1) Source column on DeviceAttendanceLogs (provenance of each punch).
-- 2) Drop the FK from DeviceAttendanceLogs.AttendanceRecordId to AttendanceRecords
--    so that deleting a device (which cascades its raw logs) never blocks on, or
--    cascades into, the shared attendance records. The link is kept as a plain
--    INT column for reporting/joins only.
-- Safe to run repeatedly (IF guards).

IF COL_LENGTH('attendance.DeviceAttendanceLogs', 'Source') IS NULL
    ALTER TABLE [attendance].[DeviceAttendanceLogs] ADD [Source] NVARCHAR(20) NULL;
GO
UPDATE [attendance].[DeviceAttendanceLogs]
SET [Source] = 'device'
WHERE [Source] IS NULL;
GO
DECLARE @conName NVARCHAR(200);
SELECT @conName = dc.name
FROM sys.foreign_key_constraints dc
JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID('attendance.DeviceAttendanceLogs')
  AND fc.parent_column_id = COLUMNPROPERTY(dc.parent_object_id, 'AttendanceRecordId', 'ColumnId');

IF @conName IS NOT NULL
    EXEC('ALTER TABLE [attendance].[DeviceAttendanceLogs] DROP CONSTRAINT [' + @conName + ']');
GO

-- ---------- 004-new-protocols-spersia.sql ----------
-- Migration 004: protocol keys for devices sold by spersia.com
-- (Virdi AC-7000, TrustOne TSG/FE series, Tosan TSP-450). Safe to re-run.

DECLARE @conName NVARCHAR(200);
SELECT @conName = dc.name
FROM sys.check_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('attendance.Devices') AND c.name = 'Protocol';

IF @conName IS NOT NULL
    EXEC('ALTER TABLE attendance.Devices DROP CONSTRAINT [' + @conName + ']');
GO
ALTER TABLE attendance.Devices
    ADD CONSTRAINT CK_Devices_Protocol CHECK ([Protocol] IN
        ('http', 'http-push', 'tcp', 'mqtt', 'zk', 'isapi', 'dws', 'fpvtech',
         'controlianz', 'suprema', 'biostar2', 'sdk600', 'wiegand-gateway',
         'realtime', 'smartplus', 'apex', 'crosschex', 'essl-pull', 'pullsdk',
         'telnet', 'websockets', 'custom',
         'virdi', 'trustone', 'tosan', 'cmitech'));
GO

-- ---------- 005-user-enrollments.sql ----------
-- Migration 005: generic user enrollment (biometric / card / password templates)
--
-- Why this exists:
--   Devices store credentials in their own proprietary formats. To be able to
--   enroll a user once (from the browser, from a master device, or by import)
--   and then TRANSFER that enrollment to any other device controlled by this
--   project, we keep a canonical, device-independent copy of every credential:
--
--     TemplateData   = base64 of the RAW vendor template exactly as captured
--                      (so it can be pushed back verbatim to same-algorithm devices)
--     CanonicalData  = base64 of our normalized JSON envelope describing the
--                      credential in a portable way (algorithm id, dimensions,
--                      quality, feature blocks...). This is what cross-device
--                      transfer adapters consume.
--
--   All PKs are INT IDENTITY(1,1), consistent with the nvarchar -> int migration.

-- ─────────────────────────── EnrollmentTemplates ───────────────────────────
IF OBJECT_ID('[attendance].[EnrollmentTemplates]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[EnrollmentTemplates] (
        [Id]            INT IDENTITY(1,1) PRIMARY KEY,
        [EmployeeId]    INT           NOT NULL,
        -- credential kinds supported by the devices in our catalog
        [TemplateType]  NVARCHAR(20)  NOT NULL CHECK ([TemplateType] IN ('fingerprint', 'face', 'irisscan', 'palmvein', 'card', 'password')),
        -- which finger / eye etc. ('left_thumb', 'right_index', ...). NULL for face/card/password.
        [Slot]          NVARCHAR(30)  NULL,
        -- card number / PIN value for non-biometric credentials (NULL for biometrics)
        [Value]         NVARCHAR(100) NULL,
        -- algorithm actually used on the source device (e.g. 'zk-finger-v10', 'hikface-v2', 'em-marshall')
        [Algorithm]     NVARCHAR(50)  NULL,
        [Quality]       INT           NULL,             -- 0..100 capture quality score
        [TemplateData]  VARBINARY(MAX) NULL,            -- raw vendor template bytes (base64 decoded server-side)
        [CanonicalData] VARBINARY(MAX) NULL,            -- normalized portable envelope (JSON bytes)
        [SourceDeviceId] INT           NULL,             -- device the template was captured on (NULL = browser/import)
        [Status]        NVARCHAR(20)  NOT NULL DEFAULT 'active' CHECK ([Status] IN ('draft', 'active', 'disabled')),
        [CreatedAt]     DATETIME DEFAULT GETDATE(),
        [UpdatedAt]     DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_EnrollmentTemplates_Employees FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE,
        CONSTRAINT FK_EnrollmentTemplates_SourceDevice FOREIGN KEY ([SourceDeviceId]) REFERENCES [attendance].[Devices]([Id]),
        -- one template per employee/type/slot combination
        CONSTRAINT UQ_EnrollmentTemplates_Slot UNIQUE ([EmployeeId], [TemplateType], [Slot])
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EnrollmentTemplates_Employee' AND object_id = OBJECT_ID('attendance.EnrollmentTemplates'))
    CREATE INDEX IX_EnrollmentTemplates_Employee ON [attendance].[EnrollmentTemplates] ([EmployeeId], [TemplateType]);
GO
-- ───────────────────── DeviceEnrollments (per-device sync state) ─────────────────────
-- Tracks WHICH templates have been pushed to WHICH devices, so the UI can show
-- "enrolled on 3/5 devices" and re-push only what is missing/stale.
IF OBJECT_ID('[attendance].[DeviceEnrollments]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[DeviceEnrollments] (
        [Id]           INT IDENTITY(1,1) PRIMARY KEY,
        [DeviceId]     INT NOT NULL,
        [TemplateId]   INT NOT NULL,
        -- last template hash pushed to this device; lets us detect stale copies
        [TemplateHash] NVARCHAR(64) NULL,
        [SyncStatus]   NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([SyncStatus] IN ('pending', 'synced', 'failed', 'removed')),
        [SyncMessage]  NVARCHAR(500) NULL,
        [SyncedAt]     DATETIME NULL,
        [CreatedAt]    DATETIME DEFAULT GETDATE(),
        [UpdatedAt]    DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_DeviceEnrollments_Devices FOREIGN KEY ([DeviceId]) REFERENCES [attendance].[Devices]([Id]) ON DELETE CASCADE,
        CONSTRAINT FK_DeviceEnrollments_Templates FOREIGN KEY ([TemplateId]) REFERENCES [attendance].[EnrollmentTemplates]([Id]) ON DELETE CASCADE,
        CONSTRAINT UQ_DeviceEnrollments_Device_Template UNIQUE ([DeviceId], [TemplateId])
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DeviceEnrollments_Device' AND object_id = OBJECT_ID('attendance.DeviceEnrollments'))
    CREATE INDEX IX_DeviceEnrollments_Device ON [attendance].[DeviceEnrollments] ([DeviceId], [SyncStatus]);
GO
-- ───────────────────── EnrollmentJobs (async push/pull/clear tasks) ─────────────────────
IF OBJECT_ID('[attendance].[EnrollmentJobs]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[EnrollmentJobs] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        [JobType]     NVARCHAR(20) NOT NULL CHECK ([JobType] IN ('push', 'pull', 'clear', 'transfer')),
        [Payload]     NVARCHAR(MAX) NULL,          -- JSON: { employeeId?, templateIds?, deviceIds?, ... }
        [Status]      NVARCHAR(20) NOT NULL DEFAULT 'queued' CHECK ([Status] IN ('queued', 'running', 'completed', 'partial', 'failed')),
        [TotalSteps]  INT NOT NULL DEFAULT 0,
        [DoneSteps]   INT NOT NULL DEFAULT 0,
        [ErrorCount]  INT NOT NULL DEFAULT 0,
        [Message]     NVARCHAR(1000) NULL,
        [StartedAt]   DATETIME NULL,
        [FinishedAt]  DATETIME NULL,
        [CreatedAt]   DATETIME DEFAULT GETDATE(),
        [UpdatedAt]   DATETIME DEFAULT GETDATE()
    );
END
GO
-- ───────────────────── EnrollmentJobSteps (per device/template result) ─────────────────────
IF OBJECT_ID('[attendance].[EnrollmentJobSteps]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[EnrollmentJobSteps] (
        [Id]        INT IDENTITY(1,1) PRIMARY KEY,
        [JobId]     INT NOT NULL,
        [DeviceId]  INT NULL,
        [TemplateId] INT NULL,
        [Action]    NVARCHAR(20) NOT NULL,          -- 'push' | 'delete' | 'pull'
        [Status]    NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([Status] IN ('pending', 'success', 'failed', 'skipped')),
        [Message]   NVARCHAR(500) NULL,
        [CreatedAt] DATETIME DEFAULT GETDATE(),
        [UpdatedAt] DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_EnrollmentJobSteps_Job FOREIGN KEY ([JobId]) REFERENCES [attendance].[EnrollmentJobs]([Id]) ON DELETE CASCADE,
        CONSTRAINT FK_EnrollmentJobSteps_Device FOREIGN KEY ([DeviceId]) REFERENCES [attendance].[Devices]([Id]),
        CONSTRAINT FK_EnrollmentJobSteps_Template FOREIGN KEY ([TemplateId]) REFERENCES [attendance].[EnrollmentTemplates]([Id])
    );
END
GO
-- ───────────────────── Permissions seed (module/action tree) ─────────────────────
-- attendance.Permissions columns: Name, Description, Module, Action, ParentId, SortOrder
DECLARE @root INT;
SELECT @root = [Id] FROM [attendance].[Permissions] WHERE [Name] = 'enrollment';
IF @root IS NULL
BEGIN
    INSERT INTO [attendance].[Permissions] ([Name], [Description], [Module], [Action], [ParentId], [SortOrder])
    VALUES ('enrollment', N'ثبت‌نام کاربران (اثر انگشت، چهره، کارت)', 'enrollment', 'view', NULL, 60);
    SET @root = SCOPE_IDENTITY();
END

IF NOT EXISTS (SELECT 1 FROM [attendance].[Permissions] WHERE [Name] = 'enrollment.view')
INSERT INTO [attendance].[Permissions] ([Name], [Description], [Module], [Action], [ParentId], [SortOrder])
VALUES ('enrollment.view', N'مشاهده الگوهای ثبت‌نام', 'enrollment', 'view', @root, 61);

IF NOT EXISTS (SELECT 1 FROM [attendance].[Permissions] WHERE [Name] = 'enrollment.manage')
INSERT INTO [attendance].[Permissions] ([Name], [Description], [Module], [Action], [ParentId], [SortOrder])
VALUES ('enrollment.manage', N'ثبت، حذف و انتقال الگوها بین دستگاه‌ها', 'enrollment', 'manage', @root, 62);
GO

-- ---------- 006-iran-holidays.sql ----------
-- Migration 006: Iranian official-holiday table (تقویم رسمی کشور)
--
-- The code-side service (server/services/holidays.mjs) knows the FIXED holidays
-- (Nowruz, 22 Bahman, ...) plus a built-in list for recent Jalali years. Lunar
-- religious holidays drift ~10-11 days per year, so each year's official list is
-- inserted here as data rows and merged by the service at runtime. This keeps
-- yearly maintenance to "run one INSERT script" instead of a code change.
--
-- Safe to run repeatedly (IF guards).

IF OBJECT_ID('[attendance].[Holidays]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[Holidays] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        -- Gregorian date of the holiday (the system stores/queries dates in
        -- both worlds; jalali conversion happens in the app layer).
        [HolidayDate] DATE NOT NULL,
        -- Persian display name, e.g. N'عید نوروز'
        [Name]        NVARCHAR(100) NOT NULL,
        -- 'jalali-fixed' | 'gregorian-fixed' | 'lunar' | 'weekly-thursday-extra'
        [Kind]        NVARCHAR(20) NOT NULL DEFAULT 'lunar',
        -- Optional Jalali components for reporting/sorting
        [JalaliYear]  INT NULL,
        [JalaliMonth] INT NULL,
        [JalaliDay]   INT NULL,
        [IsOfficial]  BIT NOT NULL DEFAULT 1,   -- official closure day vs. advisory observance
        [CreatedAt]   DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_Holidays_Date UNIQUE ([HolidayDate], [Name])
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Holidays_Date' AND object_id = OBJECT_ID('attendance.Holidays'))
    CREATE INDEX IX_Holidays_Date ON [attendance].[Holidays] ([HolidayDate]);
GO

-- ---------- 007-iran-labor-law.sql ----------
-- Migration 007: Iranian labor-law features (قانون کار)
--   * Extended leave types + multi-level approval chain
--   * Leave balances (مانده مرخصی) with statutory accrual
--   * Missions/travel orders (مأموریت)
--   * Attendance corrections workflow (اصلاح تردد)
--   * Payroll runs & payslips (حقوق، اضافه‌کاری، شب‌کاری، جمعه‌کاری)
--   * Outbound notification log (SMS/email)
-- Safe to run repeatedly (IF guards). SQL Server syntax.

-- ============================================================
-- 1) LeaveRequests: extend Type/Status CHECK constraints + new columns
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.check_constraints dc
           JOIN sys.tables t ON dc.parent_object_id = t.object_id
           JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = dc.parent_column_id
           WHERE t.name = 'LeaveRequests' AND SCHEMA_NAME(t.schema_id)='attendance' AND c.name = 'Type'
             AND dc.definition NOT LIKE '%marriage%')
BEGIN
    DECLARE @conName NVARCHAR(200);
    SELECT TOP 1 @conName = dc.name
    FROM sys.check_constraints dc
    JOIN sys.tables t ON dc.parent_object_id = t.object_id
    JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = dc.parent_column_id
    WHERE t.name = 'LeaveRequests' AND SCHEMA_NAME(t.schema_id)='attendance' AND c.name = 'Type';
    EXEC(N'ALTER TABLE [attendance].[LeaveRequests] DROP CONSTRAINT [' + @conName + N']');
    ALTER TABLE [attendance].[LeaveRequests]
        ADD CONSTRAINT CK_LeaveRequests_Type CHECK ([Type] IN
            ('sick','annual','personal','unpaid','mission','marriage','mourning','hajj','educational','paternity','miscarriage'));
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.LeaveRequests') AND name = 'DurationDays')
    ALTER TABLE [attendance].[LeaveRequests] ADD [DurationDays] DECIMAL(6,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.LeaveRequests') AND name = 'CurrentStep')
    ALTER TABLE [attendance].[LeaveRequests] ADD [CurrentStep] INT NOT NULL DEFAULT 0;
GO
-- ============================================================
-- 2) LeaveApprovals: multi-level approval chain (مدیر مستقیم → منابع انسانی)
-- ============================================================
IF OBJECT_ID('[attendance].[LeaveApprovals]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[LeaveApprovals] (
        [Id]           INT IDENTITY(1,1) PRIMARY KEY,
        [LeaveId]      INT NOT NULL,
        [Level]        INT NOT NULL,                       -- 1 = direct manager, 2 = HR, ...
        [ApproverUserId] INT NULL,
        [Action]       NVARCHAR(20) NOT NULL CHECK ([Action] IN ('pending','approved','rejected','skipped')),
        [Comment]      NVARCHAR(500) NULL,
        [ActedAt]      DATETIME NULL,
        [CreatedAt]    DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_LeaveApprovals_Leaves FOREIGN KEY ([LeaveId])
            REFERENCES [attendance].[LeaveRequests]([Id]) ON DELETE CASCADE
    );
END
GO
-- ============================================================
-- 3) LeaveBalances: مانده مرخصی per employee per Jalali year
--    Statutory: 26 days annual + 2 sick-days baseline per year (۲.۵ روز/ماه)
-- ============================================================
IF OBJECT_ID('[attendance].[LeaveBalances]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[LeaveBalances] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        [EmployeeId]  INT NOT NULL,
        [JalaliYear]  INT NOT NULL,
        [AnnualEntitled]  DECIMAL(7,2) NOT NULL DEFAULT 26,
        [AnnualUsed]      DECIMAL(7,2) NOT NULL DEFAULT 0,
        [SickEntitled]    DECIMAL(7,2) NOT NULL DEFAULT 21,   -- استعلاجی با موافقت پزشک
        [SickUsed]        DECIMAL(7,2) NOT NULL DEFAULT 0,
        [UnpaidUsed]      DECIMAL(7,2) NOT NULL DEFAULT 0,
        [CarryOverDays]   DECIMAL(7,2) NOT NULL DEFAULT 0,    -- منتقل شده از سال قبل
        [UpdatedAt]   DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_LeaveBalances UNIQUE ([EmployeeId],[JalaliYear]),
        CONSTRAINT FK_LeaveBalances_Employees FOREIGN KEY ([EmployeeId])
            REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE
    );
END
GO
-- ============================================================
-- 4) Missions: مأموریت (distinct from attendance; carries حق مأموریت)
-- ============================================================
IF OBJECT_ID('[attendance].[Missions]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[Missions] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        [EmployeeId]  INT NOT NULL,
        [StartDate]   NVARCHAR(10) NOT NULL,   -- Jalali yyyy-mm-dd like other date columns
        [EndDate]     NVARCHAR(10) NOT NULL,
        [Destination] NVARCHAR(200) NULL,
        [Purpose]     NVARCHAR(500) NOT NULL,
        [Allowance]   DECIMAL(12,2) NULL,      -- حق مأموریت (تومان)
        [Status]      NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([Status] IN ('pending','approved','rejected','done')),
        [ApproverUserId] INT NULL,
        [ActedAt]     DATETIME NULL,
        [CreatedAt]   DATETIME DEFAULT GETDATE(),
        [UpdatedAt]   DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Missions_Employees FOREIGN KEY ([EmployeeId])
            REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE
    );
END
GO
-- ============================================================
-- 5) AttendanceCorrections: درخواست اصلاح تردد با تایید مدیر
-- ============================================================
IF OBJECT_ID('[attendance].[AttendanceCorrections]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[AttendanceCorrections] (
        [Id]             INT IDENTITY(1,1) PRIMARY KEY,
        [RecordId]       INT NULL,
        [EmployeeId]     INT NOT NULL,
        [Date]           NVARCHAR(10) NOT NULL,
        [RequestedClockIn]  NVARCHAR(5) NULL,
        [RequestedClockOut] NVARCHAR(5) NULL,
        [Reason]         NVARCHAR(500) NOT NULL,
        [Status]         NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([Status] IN ('pending','approved','rejected')),
        [ApproverUserId] INT NULL,
        [ApproverComment] NVARCHAR(500) NULL,
        [ActedAt]        DATETIME NULL,
        [CreatedAt]      DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Corrections_Employees FOREIGN KEY ([EmployeeId])
            REFERENCES [attendance].[Employees]([Id]) ON DELETE CASCADE
    );
END
GO
-- ============================================================
-- 6) PayrollRuns + PayslipItems: حقوق و دستمزد
--    earnings keys: baseSalary, overtime (X multiplier), nightWork (+35%),
--    fridayWork/holidayWork (+40%), missionAllowance, mealAllowance,
--    transportation, housing, children (حق اولاد), taskHardship (سختی کار)
--    deductions keys: insurance (7% employee), tax (مالیات حقوق), loan, absence, late
-- ============================================================
IF OBJECT_ID('[attendance].[PayrollRuns]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[PayrollRuns] (
        [Id]         INT IDENTITY(1,1) PRIMARY KEY,
        [JalaliYear] INT NOT NULL,
        [JalaliMonth] INT NOT NULL,
        [Title]      NVARCHAR(100) NULL,
        [Status]     NVARCHAR(20) NOT NULL DEFAULT 'draft' CHECK ([Status] IN ('draft','calculated','approved','paid')),
        [TotalGross]   DECIMAL(18,2) NOT NULL DEFAULT 0,
        [TotalNet]     DECIMAL(18,2) NOT NULL DEFAULT 0,
        [CreatedBy]  INT NULL,
        [CreatedAt]  DATETIME DEFAULT GETDATE(),
        [UpdatedAt]  DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_PayrollRuns_Period UNIQUE ([JalaliYear],[JalaliMonth])
    );
END
GO
-- Employee salary configuration (حقوق پایه و فوقانی — مبالغ به تومان)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'BaseSalary')
    ALTER TABLE [attendance].[Employees] ADD [BaseSalary] DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'HourlyRate')
    ALTER TABLE [attendance].[Employees] ADD [HourlyRate] DECIMAL(18,2) NULL;   -- for overtime; defaults to BaseSalary/191.6 if NULL
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'MealAllowance')
    ALTER TABLE [attendance].[Employees] ADD [MealAllowance] DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'TransportAllowance')
    ALTER TABLE [attendance].[Employees] ADD [TransportAllowance] DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'HousingAllowance')
    ALTER TABLE [attendance].[Employees] ADD [HousingAllowance] DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Employees') AND name = 'ChildrenCount')
    ALTER TABLE [attendance].[Employees] ADD [ChildrenCount] INT NOT NULL DEFAULT 0;
GO
IF OBJECT_ID('[attendance].[Payslips]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[Payslips] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        [RunId]       INT NOT NULL,
        [EmployeeId]  INT NOT NULL,
        [EarningsJson] NVARCHAR(MAX) NOT NULL DEFAULT '{}',  -- {"baseSalary":..,"overtime":..,...}
        [DeductionsJson] NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        [HoursWorked]    DECIMAL(8,2) NULL,
        [OvertimeHours]  DECIMAL(8,2) NULL,
        [NightHours]     DECIMAL(8,2) NULL,
        [HolidayHours]   DECIMAL(8,2) NULL,
        [LateMinutes]    INT NULL,
        [AbsentDays]     DECIMAL(6,2) NULL,
        [Gross]       DECIMAL(18,2) NOT NULL DEFAULT 0,
        [Net]         DECIMAL(18,2) NOT NULL DEFAULT 0,
        [CreatedAt]   DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Payslips_Run FOREIGN KEY ([RunId]) REFERENCES [attendance].[PayrollRuns]([Id]) ON DELETE CASCADE,
        CONSTRAINT FK_Payslips_Employee FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id]),
        CONSTRAINT UQ_Payslip_Employee UNIQUE ([RunId],[EmployeeId])
    );
END
GO
-- ============================================================
-- 7) NotificationLog: SMS (کاوه‌گار/SMS.ir) و ایمیل
-- ============================================================
IF OBJECT_ID('[attendance].[NotificationLog]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[NotificationLog] (
        [Id]        INT IDENTITY(1,1) PRIMARY KEY,
        [Channel]   NVARCHAR(20) NOT NULL CHECK ([Channel] IN ('sms','email')),
        [Provider]  NVARCHAR(50) NULL,               -- kavenegar | smsir | smtp
        [To]        NVARCHAR(200) NOT NULL,
        [Subject]   NVARCHAR(200) NULL,
        [Body]      NVARCHAR(1000) NOT NULL,
        [Template]  NVARCHAR(100) NULL,
        [UserId]    INT NULL,
        [Status]    NVARCHAR(20) NOT NULL DEFAULT 'queued' CHECK ([Status] IN ('queued','sent','failed')),
        [Error]     NVARCHAR(500) NULL,
        [SentAt]    DATETIME NULL,
        [CreatedAt] DATETIME DEFAULT GETDATE()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Notifications_Created' AND object_id=OBJECT_ID('attendance.NotificationLog'))
    CREATE INDEX IX_Notifications_Created ON [attendance].[NotificationLog] ([CreatedAt] DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Approvals_Leave' AND object_id=OBJECT_ID('attendance.LeaveApprovals'))
    CREATE INDEX IX_Approvals_Leave ON [attendance].[LeaveApprovals] ([LeaveId],[Level]);
GO

-- ---------- 008-realtime-permission.sql ----------
-- Migration 008: permission for the realtime device attendance feed
--   devices.realtime ('مشاهده زنده تردد دستگاه‌ها') — leaf under the devices
--   root. Required to open GET /api/stream (SSE live punch feed). Granted by
--   default to 'مدیر سیستم' (inherits down the role tree) and explicitly to
--   'مدیر'; ordinary 'کارمند' users do NOT see live punches from all devices.
-- Safe to run repeatedly (IF guards). SQL Server syntax.

DECLARE @devicesRoot INT;
SELECT @devicesRoot = [Id] FROM [attendance].[Permissions]
WHERE [Module] = 'devices' AND [Action] = '*' AND [ParentId] IS NULL;

IF NOT EXISTS (SELECT 1 FROM [attendance].[Permissions] WHERE [Name] = 'devices.realtime')
BEGIN
    INSERT INTO [attendance].[Permissions]
        ([Name], [Description], [Module], [Action], [ParentId], [SortOrder])
    VALUES
        (N'devices.realtime', N'مشاهده زنده تردد دستگاه‌ها (فید SSE)', 'devices', 'realtime', @devicesRoot, 6);
END
GO
-- Grant to admin role ('مدیر سیستم'); child roles inherit via the role tree,
-- so also grant to 'مدیر' explicitly in case deployments renamed the tree.
INSERT INTO [attendance].[RolePermissions] ([RoleId], [PermissionId])
SELECT r.[Id], p.[Id]
FROM [attendance].[Permissions] p
CROSS JOIN [attendance].[Roles] r
WHERE p.[Name] = 'devices.realtime'
  AND r.[Name] IN (N'مدیر سیستم', N'مدیر')
  AND NOT EXISTS (
      SELECT 1 FROM [attendance].[RolePermissions] rp
      WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id
  );
GO

-- ---------- 010-login-lockout.sql ----------
-- Migration 010: login lockout columns (Phase 1 / P1.1)
-- Adds brute-force protection state to attendance.Users:
--   FailedLoginAttempts — consecutive failed logins since last success
--   LockedUntil         — UTC-ish server time; logins rejected while > GETDATE()
-- Configurable via env on the app side: MAX_FAILED_LOGINS (default 5),
-- LOCKOUT_MINUTES (default 15). Safe to run repeatedly (IF guards).

IF COL_LENGTH('attendance.Users', 'FailedLoginAttempts') IS NULL
    ALTER TABLE [attendance].[Users] ADD [FailedLoginAttempts] INT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('attendance.Users', 'LockedUntil') IS NULL
    ALTER TABLE [attendance].[Users] ADD [LockedUntil] DATETIME NULL;
GO

-- ---------- 011-password-history.sql ----------
-- Migration 011: password history + expiry (Phase 1 / P1.3)
-- Blocks reuse of the last N password hashes (PASSWORD_HISTORY_SIZE, default 5)
-- and optionally expires passwords (PASSWORD_EXPIRY_DAYS, default 0 = never).
-- Safe to run repeatedly (IF guards).

IF OBJECT_ID('attendance.PasswordHistory', 'U') IS NULL
CREATE TABLE [attendance].[PasswordHistory] (
    [Id]           INT IDENTITY(1,1) PRIMARY KEY,
    [UserId]       INT NOT NULL,
    [PasswordHash] NVARCHAR(500) NOT NULL,
    [CreatedAt]    DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_PasswordHistory_Users] FOREIGN KEY ([UserId])
        REFERENCES [attendance].[Users]([Id]) ON DELETE CASCADE
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordHistory_User' AND object_id = OBJECT_ID('attendance.PasswordHistory'))
    CREATE INDEX [IX_PasswordHistory_User] ON [attendance].[PasswordHistory] ([UserId], [CreatedAt] DESC);
GO
IF COL_LENGTH('attendance.Users', 'PasswordExpiresAt') IS NULL
    ALTER TABLE [attendance].[Users] ADD [PasswordExpiresAt] DATETIME NULL;
GO

-- ---------- 013-refresh-tokens.sql ----------
-- Migration 013: persistent refresh tokens / sessions (Phase 1 / P1.5)
-- Replaces the in-memory Map in server/services/auth.mjs so sessions survive
-- server restarts and can be revoked per-user by an admin ("force logout").
-- Only the SHA-256 hash of the token is stored (same pattern as API keys).
-- Safe to run repeatedly (IF guards).

IF OBJECT_ID('attendance.RefreshTokens', 'U') IS NULL
CREATE TABLE [attendance].[RefreshTokens] (
    [Id]         INT IDENTITY(1,1) PRIMARY KEY,
    [TokenHash]  NVARCHAR(64) NOT NULL UNIQUE,   -- hex SHA-256 of the opaque token
    [UserId]     INT NOT NULL,
    [ExpiresAt]  DATETIME NOT NULL,
    [RevokedAt]  DATETIME NULL,
    [DeviceInfo] NVARCHAR(300) NULL,             -- user-agent summary
    [CreatedAt]  DATETIME DEFAULT GETDATE(),
    CONSTRAINT [FK_RefreshTokens_Users] FOREIGN KEY ([UserId])
        REFERENCES [attendance].[Users]([Id]) ON DELETE CASCADE
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RefreshTokens_User' AND object_id = OBJECT_ID('attendance.RefreshTokens'))
    CREATE INDEX [IX_RefreshTokens_User] ON [attendance].[RefreshTokens] ([UserId]) INCLUDE ([ExpiresAt], [RevokedAt]);
GO

-- ---------- 014-audit-log.sql ----------
-- Migration 014: security audit trail (Phase 1 / P1.6)
-- Append-only record of security-relevant events: login success/failure/lock,
-- logout, password change/reset, user CRUD, role/permission changes, device
-- CRUD + secret rotation. Written by server/services/auditLog.mjs (best-effort:
-- a failed audit write never breaks the request it describes).
-- Read via GET /api/admin/audit-log (users module permission).

IF OBJECT_ID('attendance.AuditLog', 'U') IS NULL
CREATE TABLE [attendance].[AuditLog] (
    [Id]           INT IDENTITY(1,1) PRIMARY KEY,
    [ActorUserId]  INT NULL,                     -- NULL for anonymous (failed logins)
    [Action]       NVARCHAR(80) NOT NULL,        -- e.g. LOGIN_FAILED, USER_DELETED
    [Entity]       NVARCHAR(60) NOT NULL,        -- e.g. user, device, role
    [EntityId]     NVARCHAR(60) NULL,
    [Detail]       NVARCHAR(MAX) NULL,           -- JSON payload
    [IpAddress]    NVARCHAR(60) NULL,
    [CreatedAt]    DATETIME DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_CreatedAt' AND object_id = OBJECT_ID('attendance.AuditLog'))
    CREATE INDEX [IX_AuditLog_CreatedAt] ON [attendance].[AuditLog] ([CreatedAt] DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_Actor' AND object_id = OBJECT_ID('attendance.AuditLog'))
    CREATE INDEX [IX_AuditLog_Actor] ON [attendance].[AuditLog] ([ActorUserId], [CreatedAt] DESC);
GO

-- ---------- 015-device-commands.sql ----------
-- Migration 015: device command queue (Phase 2 / P2.2)
--   attendance.DeviceCommands — pending control commands (unlock, sync_time,
--   push_user, delete_user, get_user, refresh_data) queued by the admin UI and
--   delivered inside the webhook ACK body on the device's next ping
--   (ZK/ADMS pull-from-response pattern).
-- Safe to run repeatedly. SQL Server syntax.

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'attendance' AND t.name = 'DeviceCommands')
BEGIN
    CREATE TABLE [attendance].[DeviceCommands] (
        [Id]           INT IDENTITY(1,1) PRIMARY KEY,
        [DeviceId]     INT NOT NULL,
        [Type]         NVARCHAR(30) NOT NULL CHECK ([Type] IN ('unlock','sync_time','push_user','delete_user','get_user','refresh_data')),
        [Payload]      NVARCHAR(MAX) NULL,                -- JSON, e.g. {"pin":"123"} for push/delete_user
        [Status]       NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([Status] IN ('pending','delivered','acked','failed')),
        [CreatedAt]    DATETIME NOT NULL DEFAULT GETDATE(),
        [DeliveredAt]  DATETIME NULL,
        [AckedAt]      DATETIME NULL,
        [Attempts]     INT NOT NULL DEFAULT 0
    );

    CREATE INDEX IX_DeviceCommands_Device_Status
        ON [attendance].[DeviceCommands] ([DeviceId], [Status], [CreatedAt]);
END
GO
-- New granular permission: devices.control (leaf under the devices root),
-- required by every mutating device-command endpoint (P2.4).
DECLARE @devicesRoot INT;
SELECT @devicesRoot = [Id] FROM [attendance].[Permissions]
WHERE [Module] = 'devices' AND [Action] = '*' AND [ParentId] IS NULL;

IF NOT EXISTS (SELECT 1 FROM [attendance].[Permissions] WHERE [Name] = 'devices.control')
BEGIN
    INSERT INTO [attendance].[Permissions]
        ([Name], [Description], [Module], [Action], [ParentId], [SortOrder])
    VALUES
        (N'devices.control', N'ارسال فرمان به دستگاه (باز کردن درب، همگام‌سازی ساعت، ارسال/حذف کاربر)', 'devices', 'control', @devicesRoot, 7);
END
GO
INSERT INTO [attendance].[RolePermissions] ([RoleId], [PermissionId])
SELECT r.[Id], p.[Id]
FROM [attendance].[Permissions] p
CROSS JOIN [attendance].[Roles] r
WHERE p.[Name] = 'devices.control'
  AND r.[Name] IN (N'مدیر سیستم', N'مدیر')
  AND NOT EXISTS (
      SELECT 1 FROM [attendance].[RolePermissions] rp
      WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id
  );
GO

-- ---------- 016-device-last-pull.sql ----------
-- Migration 016: last-pull bookkeeping + offline alert flag (Phase 2 / P2.5, P2.6)
--   attendance.Devices.LastPulledAt — timestamp of the most recent completed
--   poll/backfill pass per device (set by the server-side poller loop).
--   attendance.Devices.OfflineAlerted — dedupe flag so the offline sweeper
--   emits exactly one alert per offline episode (reset when the device returns).
-- Safe to run repeatedly. SQL Server syntax.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[attendance].[Devices]') AND name = 'LastPulledAt')
BEGIN
    ALTER TABLE [attendance].[Devices] ADD [LastPulledAt] DATETIME NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[attendance].[Devices]') AND name = 'OfflineAlerted')
BEGIN
    ALTER TABLE [attendance].[Devices] ADD [OfflineAlerted] BIT NOT NULL DEFAULT 0;
END
GO

-- ---------- 017-device-offline-status.sql ----------
-- Migration 017: allow 'offline' as a device status (Phase 2 / P2.6).
-- The original schema constrains attendance.Devices.Status to
-- ('active','inactive','error','maintenance'); the offline sweeper needs an
-- explicit 'offline' state so the Monitor UI and alerts can distinguish
-- "not configured" (inactive) from "was running, stopped answering" (offline).
-- Safe to run repeatedly; drops only the Status CHECK constraint.

DECLARE @sql NVARCHAR(MAX);

SELECT @sql = 'ALTER TABLE [attendance].[Devices] DROP CONSTRAINT [' + c.name + ']'
FROM sys.check_constraints c
JOIN sys.columns col ON col.object_id = c.parent_object_id AND col.column_id = c.parent_column_id
WHERE c.parent_object_id = OBJECT_ID(N'[attendance].[Devices]')
  AND col.name = 'Status';

IF @sql IS NOT NULL EXEC(@sql);
GO
UPDATE [attendance].[Devices] SET [Status] = 'active' WHERE [Status] NOT IN ('active','inactive','error','maintenance','offline');
GO
ALTER TABLE [attendance].[Devices] ADD CONSTRAINT [CK_Attendance_Devices_Status]
    CHECK ([Status] IN ('active', 'inactive', 'error', 'maintenance', 'offline'));
GO

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

PRINT '========================================';
PRINT 'Database schema created successfully!';
PRINT '========================================';
PRINT '';
PRINT 'Schema: attendance';
PRINT 'Base tables: 20 + migration tables: 16 = 36';
PRINT 'Base indexes: 24 + migration indexes: 11 = 35';
PRINT 'Stored procedures: 2';
PRINT 'Migrations included: 16 files (see section above)';
PRINT '';
PRINT 'Next steps:';
PRINT '1. Run clean-db.sql to insert initial data';
PRINT '2. Run seed-admin.mjs to set admin password';
PRINT '3. Start the server: npm run server';
PRINT '   (boot-time migrate runner is idempotent — safe even after full schema.sql)';
PRINT '========================================';
GO
