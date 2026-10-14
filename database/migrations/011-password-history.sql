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
