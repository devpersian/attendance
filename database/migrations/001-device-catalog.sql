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
