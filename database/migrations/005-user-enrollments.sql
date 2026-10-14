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
