# Thiên Đường Sách

Website bán sách trực tuyến với các luồng từ duyệt danh mục đến giỏ hàng, đặt đơn và theo dõi giao hàng. Phần vận hành có màn hình riêng cho nhân viên, quản trị viên và shipper.

![Minh họa nhận diện của cửa hàng sách](ảnh/hero-banner.png)

> Hình trên là ảnh nhận diện cửa hàng, không phải ảnh chụp giao diện. Dữ liệu mẫu trong repository được tạo để minh họa; đây là prototype chạy cục bộ.

## Người dùng có thể làm gì?

- **Khách hàng:** tìm kiếm và lọc sách, xem thông tin chi tiết, lưu giỏ hàng, đăng ký/đăng nhập, đặt đơn và xem lịch sử đơn.
- **Nhân viên:** quản lý sách, tác giả, thể loại và nhà cung cấp; ghi nhận phiếu nhập; cập nhật trạng thái đơn hàng.
- **Quản trị viên:** xem tổng quan bán hàng, quản lý tài khoản/vai trò và xử lý các bước duyệt thanh toán, nội dung.
- **Shipper:** xem các đơn được giao và cập nhật trạng thái giao hàng theo vai trò.

## Luồng hệ thống

```text
HTML / CSS / JavaScript
        │ REST API + JWT
        ▼
Node.js + Express ───── MySQL
        │
        └── MoMo sandbox (tùy cấu hình)
```

Ứng dụng dùng Express cho API và phục vụ trang tĩnh, MySQL cho danh mục/đơn hàng/kho, JWT cho phiên đăng nhập và bcryptjs để băm mật khẩu. Trang khách hàng, nhân viên, quản trị viên và giao hàng được tách theo luồng sử dụng.

## Khởi chạy trên máy

Yêu cầu Node.js 20+ và MySQL 8+.

1. Tạo schema và dữ liệu danh mục minh họa:

   ```bash
   mysql -u root -p < database/schema.sql
   mysql -u root -p thienduongsach < database/demo-seed.sql
   ```

2. Sao chép `.env.example` thành `.env`, rồi điền thông tin MySQL và một `JWT_SECRET` ngẫu nhiên dài ít nhất 32 ký tự. Có thể tạo giá trị bằng `openssl rand -base64 48`.

3. Cài dependency và chạy server:

   ```bash
   cd server
   npm ci
   npm start
   ```

4. Mở <http://localhost:3000>.

Tài khoản khách hàng có thể đăng ký từ giao diện. Repository không chứa tài khoản quản trị mặc định hoặc dump cơ sở dữ liệu của máy cá nhân.

## Cấu trúc chính

```text
.
├── index.html, login.html, admin.html, staff.html, shipper.html
├── script.js, staff.js, styles.css
├── server/
│   ├── server.js             # API, phân quyền, đơn hàng, kho và callback thanh toán
│   └── package.json          # Dependency backend
├── database/
│   ├── schema.sql            # 17 bảng quan hệ, chỉ gồm cấu trúc
│   └── demo-seed.sql         # Danh mục/sách minh họa, không có khách hàng
└── ảnh/                      # Ảnh giao diện, danh mục và bìa sách
```

## Phạm vi demo

- QR ngân hàng trong giao diện là ảnh **DEMO ONLY**, không gắn tài khoản và không dùng để chuyển tiền. Nút xác nhận ở luồng này chỉ mô phỏng trạng thái đặt đơn.
- Phần MoMo gọi sandbox khi người chạy tự cấu hình thông tin sandbox và địa chỉ callback. Không có merchant credential trong repository.
- Đây là prototype học tập chạy cục bộ, chưa phải hệ thống thương mại điện tử đã triển khai hoặc kiểm định bảo mật. Trước khi dùng thật cần rà soát phân quyền, quản lý bí mật, xử lý thanh toán và dữ liệu cá nhân.
- Dump SQL cá nhân, dữ liệu tài khoản/đơn hàng, ảnh tải lên, QR cục bộ và cấu hình máy được giữ ngoài repository công khai.
