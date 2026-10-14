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
