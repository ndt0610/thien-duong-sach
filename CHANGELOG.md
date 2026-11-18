# Nhật ký thay đổi (Changelog) - Thiên Đường Sách
*Bản cập nhật tối ưu hóa hệ thống TMĐT*

## 1. Kiến trúc Xác thực & Bảo mật (Auth & Security)
- **Bổ sung API `/api/verify-token`**: Server kiểm tra tính hợp lệ của Token theo thời gian thực thay vì chỉ dựa vào `localStorage` trên trình duyệt. Khắc phục triệt để lỗi F5 bị văng ra trang Login ảo.
- **Global Fetch Interceptor**: Cài đặt màng lọc ở `admin.html` và `staff.js`, tự động bắt lỗi `401 Unauthorized` và `403 Forbidden` từ mọi cuộc gọi API. Tự động đăng xuất an toàn nếu Token hết hạn hoặc có ai đó cố ý giả mạo phân quyền.
- **Middleware mới**: Viết thêm `requireStaffOrShipper` trong `server.js` để cho phép cả nhân viên và shipper đều có thể cập nhật trạng thái đơn hàng một cách an toàn.
- **Sửa lỗi thiếu Headers**: Thêm `authHeaders()` vào các lời gọi API Quản lý Thể loại, Tác giả, Nhà cung cấp tại `staff.js`.

## 2. Nâng cấp Trải nghiệm Thời gian thực (Real-time UX)
- **Cơ chế Auto-polling**: Dashboard và trang Quản lý đơn hàng (Admin & Staff) sẽ tự động làm mới dữ liệu ngầm mỗi **15 giây**, loại bỏ hoàn toàn thao tác phải F5 trang bằng tay.
- **Visibility Change Listener**: Trình duyệt sẽ nhận diện khoảnh khắc nhân viên/admin quay lại tab công việc và tải ngay đơn hàng mới nhất lập tức mà không cần đợi chu kỳ 15 giây.

## 3. Vá lỗi Database Constraints (Sập Server & Xung đột khóa ngoại)
- **Bảo vệ luồng Xóa Sách**: API xóa sách (`/api/admin/books/:id` và `/api/staff/books/:id`) giờ đây kiểm tra cả bảng `CHITIETDONHANG` (Đơn hàng) và `CHITIETPHIEUNHAP` (Nhập kho). Chặn việc xóa sách đã nhập kho để bảo toàn số liệu kế toán.
- **Thêm API Xóa Nhà cung cấp**: Bổ sung endpoint `DELETE /api/staff/suppliers/:id` (trước đây bị thiếu). Có tích hợp kiểm tra bảo vệ: Không cho phép xóa nhà cung cấp đã có lịch sử trong bảng `PHIEUNHAP`.
- **Sửa cú pháp SQL**: Đã sửa lại câu lệnh Sub-query tính số lượng `DaBan` ở trang Dashboard Admin.

---
*Tất cả thay đổi đã được áp dụng trực tiếp vào mã nguồn của hệ thống hiện tại.*
