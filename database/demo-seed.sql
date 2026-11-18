-- Sample catalog only. No real customers, staff accounts, or payment records.
USE `thienduongsach`;

INSERT INTO `vaitro` (`MaVaiTro`, `TenVaiTro`, `MoTa`) VALUES
('CUST', 'Khách hàng', 'Tài khoản khách hàng demo'),
('ADMIN', 'Quản trị viên', 'Vai trò demo'),
('STAFF', 'Nhân viên', 'Vai trò demo'),
('SHIPPER', 'Giao hàng', 'Vai trò demo');

INSERT INTO `theloai` (`MaTL`, `TenTL`, `MoTa`) VALUES
(1, 'Tiểu thuyết', 'Mẫu dữ liệu danh mục'),
(2, 'Phi tiểu thuyết', 'Mẫu dữ liệu danh mục'),
(3, 'Khoa học viễn tưởng', 'Mẫu dữ liệu danh mục'),
(4, 'Trinh thám & Giật gân', 'Mẫu dữ liệu danh mục'),
(5, 'Phát triển bản thân', 'Mẫu dữ liệu danh mục'),
(6, 'Tiểu sử', 'Mẫu dữ liệu danh mục');

INSERT INTO `nhacungcap` (`MaNCC`, `TenNCC`) VALUES ('NCC-DEMO', 'Nhà cung cấp minh họa');

INSERT INTO `tacgia` (`MaTG`, `TenTG`, `TieuSu`) VALUES
(1, 'Nguyễn Nhật Ánh', 'Tác giả trong danh mục minh họa'),
(2, 'James Clear', 'Tác giả trong danh mục minh họa'),
(3, 'Arthur Conan Doyle', 'Tác giả trong danh mục minh họa');

INSERT INTO `sach` (`MaSach`, `TenSach`, `GiaBan`, `GiaGoc`, `MoTa`, `SoLuongTon`, `SoTrang`, `NgonNgu`, `MaTL`, `MaNCC`) VALUES
('S-DEMO01', 'Mùa Hè Không Tên', 95000, 120000, 'Đầu sách minh họa cho luồng duyệt danh mục và giỏ hàng.', 18, 300, 'Tiếng Việt', 1, 'NCC-DEMO'),
('S-DEMO02', 'Atomic Habits', 110000, 145000, 'Đầu sách minh họa cho tìm kiếm, chi tiết sản phẩm và đơn hàng.', 24, 320, 'Tiếng Việt', 5, 'NCC-DEMO'),
('S-DEMO03', 'Sherlock Holmes', 89000, 115000, 'Đầu sách minh họa cho lọc theo thể loại.', 12, 280, 'Tiếng Việt', 4, 'NCC-DEMO');

INSERT INTO `tacgia_sach` (`MaSach`, `MaTG`, `VaiTro`, `ThuTu`) VALUES
('S-DEMO01', 1, 'Tác giả', 1),
('S-DEMO02', 2, 'Tác giả', 1),
('S-DEMO03', 3, 'Tác giả', 1);
