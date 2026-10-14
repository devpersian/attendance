-- Migration: make attendance.Units a tree (ParentId/SortOrder) for existing DBs.
-- Safe to run repeatedly (idempotent).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Units') AND name = 'ParentId')
BEGIN
    ALTER TABLE [attendance].[Units] ADD [ParentId] INT NULL;
    ALTER TABLE [attendance].[Units] ADD CONSTRAINT [FK_Units_ParentUnit] FOREIGN KEY ([ParentId]) REFERENCES [attendance].[Units]([Id]);
    PRINT '  - Added Units.ParentId';
END
ELSE PRINT '  - Units.ParentId already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance.Units') AND name = 'SortOrder')
BEGIN
    ALTER TABLE [attendance].[Units] ADD [SortOrder] INT DEFAULT 0;
    PRINT '  - Added Units.SortOrder';
END
ELSE PRINT '  - Units.SortOrder already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Units_ParentId' AND object_id = OBJECT_ID('attendance.Units'))
BEGIN
    CREATE INDEX [IX_Units_ParentId] ON [attendance].[Units] ([ParentId]);
    PRINT '  - Created IX_Units_ParentId';
END
GO

-- Attach the two regional units under ست مرکزی if not already linked
UPDATE [attendance].[Units]
SET [ParentId] = (SELECT Id FROM (SELECT Id FROM [attendance].[Units] WHERE Name = N'ست مرکزی') AS root)
WHERE [Name] IN (N'واحد تهران', N'واحد کاشان') AND [ParentId] IS NULL
  AND EXISTS (SELECT 1 FROM [attendance].[Units] WHERE Name = N'ست مرکزی');
GO
