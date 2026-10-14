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
