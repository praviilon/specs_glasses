-- specs. glasses try-on app — MySQL / MariaDB schema
-- Import this once into your database, e.g. via phpMyAdmin's "Import" tab,
-- or from a terminal: mysql -u YOUR_USER -p YOUR_DATABASE < schema.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS selfies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_selfies_user (user_id),
  CONSTRAINT fk_selfies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS glasses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  lens_type ENUM('tint','clear') NOT NULL DEFAULT 'tint',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_glasses_user (user_id),
  CONSTRAINT fk_glasses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  selfie_id INT UNSIGNED NULL,
  glasses_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_results_user (user_id),
  CONSTRAINT fk_results_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_selfie FOREIGN KEY (selfie_id) REFERENCES selfies(id) ON DELETE SET NULL,
  CONSTRAINT fk_results_glasses FOREIGN KEY (glasses_id) REFERENCES glasses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
