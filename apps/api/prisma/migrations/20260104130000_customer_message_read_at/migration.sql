-- Add readAt timestamp to track message read state (shared across users)
ALTER TABLE `CustomerMessage`
ADD COLUMN `readAt` DATETIME NULL;
