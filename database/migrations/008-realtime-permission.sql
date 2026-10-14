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
