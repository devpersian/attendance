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
