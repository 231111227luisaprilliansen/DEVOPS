-- Migrasi untuk database yang sudah ada (database baru sudah memakai database.sql terbaru)
USE kanban_board;
ALTER TABLE cards
  ADD COLUMN priority ENUM('rendah','sedang','tinggi') NOT NULL DEFAULT 'sedang' AFTER description,
  ADD COLUMN due_date DATE NULL AFTER priority;
