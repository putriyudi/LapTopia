-- ============================================================
--  LaptopRent — Database Schema
--  MySQL 8.0+
-- ============================================================
CREATE DATABASE IF NOT EXISTS laptoprent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE laptoprent;
-- 1. Users
CREATE TABLE users (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'kasir', 'user') NOT NULL DEFAULT 'user',
    nama_lengkap VARCHAR(100) NOT NULL,
    nik VARCHAR(16) UNIQUE,
    no_hp VARCHAR(20) NOT NULL,
    alamat TEXT,
    foto_ktp_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 2. Laptops
CREATE TABLE laptops (
    id_laptop INT AUTO_INCREMENT PRIMARY KEY,
    nomor_seri VARCHAR(50) UNIQUE NOT NULL,
    merk_tipe VARCHAR(100) NOT NULL,
    spesifikasi TEXT,
    harga_sewa_per_hari DECIMAL(10,2) NOT NULL,
    status ENUM('Tersedia','Disewa','Maintenance') DEFAULT 'Tersedia',
    foto_laptop VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3. Transaksi
CREATE TABLE transaksi (
    id_transaksi INT AUTO_INCREMENT PRIMARY KEY,
    id_kasir INT,
    id_user_penyewa INT,
    id_laptop INT NOT NULL,
    nama_penyewa VARCHAR(100) NOT NULL,
    nik_penyewa VARCHAR(16) NOT NULL,
    no_hp_penyewa VARCHAR(20) NOT NULL,
    alamat_penyewa TEXT NOT NULL,
    email_penyewa VARCHAR(100) NOT NULL,
    jaminan_file_path VARCHAR(255) NOT NULL,
    jaminan_fisik VARCHAR(100),
    tgl_mulai_sewa DATETIME NOT NULL,
    durasi_hari INT NOT NULL,
    tgl_kembali_rencana DATETIME NOT NULL,
    tgl_kembali_aktual DATETIME,
    total_biaya DECIMAL(10,2) NOT NULL,
    denda DECIMAL(10,2) DEFAULT 0.00,
    status_transaksi ENUM('Booking','Aktif','Selesai','Terlambat','Dibatalkan') DEFAULT 'Booking',
    -- Payment
    payment_order_id VARCHAR(100) UNIQUE,
    payment_status ENUM('pending','paid','failed','expired') DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_token VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_kasir) REFERENCES users(id_user) ON DELETE SET NULL,
    FOREIGN KEY (id_user_penyewa) REFERENCES users(id_user) ON DELETE SET NULL,
    FOREIGN KEY (id_laptop) REFERENCES laptops(id_laptop) ON DELETE RESTRICT
);
-- 4. Kontrak Digital
CREATE TABLE kontrak_digital (
    id_kontrak INT AUTO_INCREMENT PRIMARY KEY,
    id_transaksi INT NOT NULL UNIQUE,
    file_pdf_path VARCHAR(255) NOT NULL,
    digital_hash VARCHAR(64) NOT NULL UNIQUE,
    tgl_generate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_transaksi) REFERENCES transaksi(id_transaksi) ON DELETE CASCADE
);
-- ============================================================
--  SEED DATA
-- ============================================================
-- Admin default (password: Admin@1234)
INSERT INTO users (username, email, password, role, nama_lengkap, no_hp) VALUES
('admin', 'admin@laptoprent.com', 'Admin@1234', 'admin', 'Administrator', '08000000000');
-- Kasir default (password: Kasir@1234)
INSERT INTO users (username, email, password, role, nama_lengkap, no_hp) VALUES
('kasir1', 'kasir@laptoprent.com', 'Kasir@1234', 'kasir', 'Kasir Satu', '08111111111');
-- Laptop sample data
INSERT INTO laptops (nomor_seri, merk_tipe, spesifikasi, harga_sewa_per_hari, status) VALUES
('MBP-M3-001', 'MacBook Pro M3 14"', 'Apple M3, 16GB RAM, 512GB SSD, macOS Sonoma', 150000, 'Tersedia'),
('ROG-G16-001', 'ASUS ROG Strix G16', 'Intel i9-13980HX, 32GB RAM, 1TB SSD, RTX 4090, Win11', 200000, 'Tersedia'),
('XPS-15-001', 'Dell XPS 15 OLED', 'Intel i7-13700H, 16GB RAM, 1TB SSD, OLED 15", Win11', 120000, 'Tersedia'),
('MBA-M2-001', 'MacBook Air M2 13"', 'Apple M2, 8GB RAM, 256GB SSD, macOS Sonoma', 90000, 'Tersedia'),
('LNV-T14-001', 'Lenovo ThinkPad T14', 'AMD Ryzen 7 7730U, 16GB RAM, 512GB SSD, Win11 Pro', 80000, 'Tersedia'),
('HP-SPE-001', 'HP Spectre x360 13', 'Intel i7-1355U, 16GB RAM, 1TB SSD, 2-in-1 OLED, Win11', 110000, 'Tersedia'),
('MSI-CR-001', 'MSI Creator Z16', 'Intel i7-12700H, 32GB RAM, 1TB SSD, RTX 3060, Win11', 175000, 'Tersedia'),
('LNV-Y9-001', 'Lenovo IdeaPad Gaming 3', 'AMD Ryzen 5 6600H, 8GB RAM, 512GB SSD, RTX 3050', 70000, 'Maintenance');
