-- Skema database Kanban Board (MySQL 8 / MariaDB 10.4+)
-- Impor: mysql -u root -p < database.sql

CREATE DATABASE IF NOT EXISTS kanban_board
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kanban_board;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_projects_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS columns_board (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title      VARCHAR(80) NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_columns_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_columns_project (project_id, position)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cards (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  column_id   INT UNSIGNED NOT NULL,
  project_id  INT UNSIGNED NOT NULL,
  title       VARCHAR(150) NOT NULL,
  description TEXT NULL,
  priority    ENUM('rendah','sedang','tinggi') NOT NULL DEFAULT 'sedang',
  due_date    DATE NULL,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cards_column FOREIGN KEY (column_id)  REFERENCES columns_board(id) ON DELETE CASCADE,
  CONSTRAINT fk_cards_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_cards_column (column_id, position)
) ENGINE=InnoDB;

-- Riwayat aktivitas per project (siapa, apa, kapan)
CREATE TABLE IF NOT EXISTS project_history (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  action     VARCHAR(40) NOT NULL,   -- project_created, card_created, card_moved, card_updated, card_deleted, ...
  detail     VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  INDEX idx_history_project (project_id, created_at)
) ENGINE=InnoDB;
