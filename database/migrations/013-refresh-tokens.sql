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
