-- Thiên Đường Sách: schema-only local setup. No customer, staff, order, or payment records included.
CREATE DATABASE IF NOT EXISTS `thienduongsach` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `thienduongsach`;

CREATE TABLE `chucnang` (
  `MaCN` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenCN` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `NhomCN` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  PRIMARY KEY (`MaCN`),
  UNIQUE KEY `TenCN` (`TenCN`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhacungcap` (
  `MaNCC` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenNCC` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DiaChi` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SDT` char(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MaSoThue` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaNCC`),
  UNIQUE KEY `Email` (`Email`),
  UNIQUE KEY `MaSoThue` (`MaSoThue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tacgia` (
  `MaTG` int NOT NULL AUTO_INCREMENT,
  `TenTG` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TieuSu` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`MaTG`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `theloai` (
  `MaTL` int NOT NULL AUTO_INCREMENT,
  `TenTL` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MoTa` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`MaTL`),
  UNIQUE KEY `TenTL` (`TenTL`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vaitro` (
  `MaVaiTro` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenVaiTro` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MoTa` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  PRIMARY KEY (`MaVaiTro`),
  UNIQUE KEY `TenVaiTro` (`TenVaiTro`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `phanquyen` (
  `MaVaiTro` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaCN` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CoQuyen` bit(1) DEFAULT b'0',
  PRIMARY KEY (`MaVaiTro`,`MaCN`),
  KEY `MaCN` (`MaCN`),
  CONSTRAINT `phanquyen_ibfk_1` FOREIGN KEY (`MaVaiTro`) REFERENCES `vaitro` (`MaVaiTro`),
  CONSTRAINT `phanquyen_ibfk_2` FOREIGN KEY (`MaCN`) REFERENCES `chucnang` (`MaCN`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sach` (
  `MaSach` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenSach` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `GiaBan` decimal(15,0) DEFAULT NULL,
  `GiaGoc` decimal(15,0) DEFAULT NULL,
  `AnhBia` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MoTa` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `SoLuongTon` int DEFAULT '0',
  `NgayXuatBan` date DEFAULT NULL,
  `ISBN` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SoTrang` int DEFAULT NULL,
  `NgonNgu` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MaTL` int DEFAULT NULL,
  `MaNCC` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaSach`),
  UNIQUE KEY `ISBN` (`ISBN`),
  KEY `MaTL` (`MaTL`),
  KEY `MaNCC` (`MaNCC`),
  CONSTRAINT `sach_ibfk_1` FOREIGN KEY (`MaTL`) REFERENCES `theloai` (`MaTL`),
  CONSTRAINT `sach_ibfk_2` FOREIGN KEY (`MaNCC`) REFERENCES `nhacungcap` (`MaNCC`),
  CONSTRAINT `sach_chk_1` CHECK ((`GiaBan` >= 0)),
  CONSTRAINT `sach_chk_2` CHECK ((`GiaGoc` >= 0)),
  CONSTRAINT `sach_chk_3` CHECK ((`SoLuongTon` >= 0)),
  CONSTRAINT `sach_chk_4` CHECK ((`SoTrang` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `taikhoan` (
  `MaTK` int NOT NULL AUTO_INCREMENT,
  `Email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MatKhau` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaVaiTro` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CUST',
  `TrangThai` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`MaTK`),
  UNIQUE KEY `Email` (`Email`),
  KEY `MaVaiTro` (`MaVaiTro`),
  CONSTRAINT `taikhoan_ibfk_1` FOREIGN KEY (`MaVaiTro`) REFERENCES `vaitro` (`MaVaiTro`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `khachhang` (
  `MaKH` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenKH` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DiaChi` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SDT` char(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MaTK` int DEFAULT NULL,
  PRIMARY KEY (`MaKH`),
  UNIQUE KEY `MaTK` (`MaTK`),
  CONSTRAINT `khachhang_ibfk_1` FOREIGN KEY (`MaTK`) REFERENCES `taikhoan` (`MaTK`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nguoigiaohang` (
  `MaNV` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenNV` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SDT` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MaTK` int DEFAULT NULL,
  PRIMARY KEY (`MaNV`),
  UNIQUE KEY `MaTK` (`MaTK`),
  CONSTRAINT `nguoigiaohang_ibfk_1` FOREIGN KEY (`MaTK`) REFERENCES `taikhoan` (`MaTK`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhanvien` (
  `MaNV` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `TenNV` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ChucVu` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MaTK` int DEFAULT NULL,
  PRIMARY KEY (`MaNV`),
  UNIQUE KEY `MaTK` (`MaTK`),
  CONSTRAINT `nhanvien_ibfk_1` FOREIGN KEY (`MaTK`) REFERENCES `taikhoan` (`MaTK`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tacgia_sach` (
  `MaSach` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaTG` int NOT NULL,
  `VaiTro` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ThuTu` int DEFAULT NULL,
  PRIMARY KEY (`MaSach`,`MaTG`),
  KEY `MaTG` (`MaTG`),
  CONSTRAINT `tacgia_sach_ibfk_1` FOREIGN KEY (`MaSach`) REFERENCES `sach` (`MaSach`),
  CONSTRAINT `tacgia_sach_ibfk_2` FOREIGN KEY (`MaTG`) REFERENCES `tacgia` (`MaTG`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `donhang` (
  `MaDH` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `NgayDat` datetime DEFAULT CURRENT_TIMESTAMP,
  `TongTien` decimal(15,0) DEFAULT NULL,
  `TrangThai` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DiaChiGiao` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MaKH` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaDH`),
  KEY `MaKH` (`MaKH`),
  CONSTRAINT `donhang_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`),
  CONSTRAINT `donhang_chk_1` CHECK ((`TongTien` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `phieunhap` (
  `MaPN` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `NgayNhap` datetime DEFAULT CURRENT_TIMESTAMP,
  `MaNV` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MaNCC` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TongTienNhap` decimal(15,0) DEFAULT NULL,
  `GhiChu` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`MaPN`),
  KEY `MaNV` (`MaNV`),
  KEY `MaNCC` (`MaNCC`),
  CONSTRAINT `phieunhap_ibfk_1` FOREIGN KEY (`MaNV`) REFERENCES `nhanvien` (`MaNV`),
  CONSTRAINT `phieunhap_ibfk_2` FOREIGN KEY (`MaNCC`) REFERENCES `nhacungcap` (`MaNCC`),
  CONSTRAINT `phieunhap_chk_1` CHECK ((`TongTienNhap` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chitietdonhang` (
  `MaDonHang` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaSach` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `SoLuong` int DEFAULT NULL,
  `DonGiaBan` decimal(18,0) DEFAULT NULL,
  `ThanhTien` decimal(18,0) DEFAULT NULL,
  PRIMARY KEY (`MaDonHang`,`MaSach`),
  KEY `MaSach` (`MaSach`),
  CONSTRAINT `chitietdonhang_ibfk_1` FOREIGN KEY (`MaDonHang`) REFERENCES `donhang` (`MaDH`),
  CONSTRAINT `chitietdonhang_ibfk_2` FOREIGN KEY (`MaSach`) REFERENCES `sach` (`MaSach`),
  CONSTRAINT `chitietdonhang_chk_1` CHECK ((`SoLuong` > 0)),
  CONSTRAINT `chitietdonhang_chk_2` CHECK ((`DonGiaBan` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chitietphieunhap` (
  `MaPN` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaSach` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `SoLuongNhap` int DEFAULT NULL,
  `GiaNhap` decimal(15,0) DEFAULT NULL,
  `ThanhTien` decimal(15,0) DEFAULT NULL,
  PRIMARY KEY (`MaPN`,`MaSach`),
  KEY `MaSach` (`MaSach`),
  CONSTRAINT `chitietphieunhap_ibfk_1` FOREIGN KEY (`MaPN`) REFERENCES `phieunhap` (`MaPN`),
  CONSTRAINT `chitietphieunhap_ibfk_2` FOREIGN KEY (`MaSach`) REFERENCES `sach` (`MaSach`),
  CONSTRAINT `chitietphieunhap_chk_1` CHECK ((`SoLuongNhap` > 0)),
  CONSTRAINT `chitietphieunhap_chk_2` CHECK ((`GiaNhap` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `thanhtoan` (
  `MaGD` char(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MaDH` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `PhuongThuc` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SoTien` decimal(15,0) DEFAULT NULL,
  `MaGiaoDich_Cong` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TrangThai` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ThoiGian` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaGD`),
  KEY `MaDH` (`MaDH`),
  CONSTRAINT `thanhtoan_ibfk_1` FOREIGN KEY (`MaDH`) REFERENCES `donhang` (`MaDH`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
