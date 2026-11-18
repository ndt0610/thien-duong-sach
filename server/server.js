require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multer config for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'ảnh', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueName + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const valid = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        cb(valid ? null : new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)'), valid);
    }
});

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value with at least 32 characters.');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate Limiting - chống brute force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Tăng lên 100 để không bị block khi test
    message: { success: false, message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- 3.1 API TÍCH HỢP MOMO ---
const https = require('https');
const crypto = require('crypto');

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE;
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY;
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY;
const MOMO_ENDPOINT = process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create';
const MOMO_RETURN_URL = process.env.MOMO_RETURN_URL;
const MOMO_IPN_URL = process.env.MOMO_IPN_URL;

app.post('/api/momo-payment', async (req, res) => {
    try {
        const { amount, orderId, orderInfo } = req.body;

        const requestId = MOMO_PARTNER_CODE + new Date().getTime();
        const requestType = "captureWallet";
        const extraData = "";

        const rawSignature = `accessKey=${MOMO_ACCESS_KEY}&amount=${amount}&extraData=${extraData}&ipnUrl=${MOMO_IPN_URL}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${MOMO_PARTNER_CODE}&redirectUrl=${MOMO_RETURN_URL}&requestId=${requestId}&requestType=${requestType}`;

        const signature = crypto.createHmac('sha256', MOMO_SECRET_KEY)
            .update(rawSignature)
            .digest('hex');

        const requestBody = JSON.stringify({
            partnerCode: MOMO_PARTNER_CODE,
            accessKey: MOMO_ACCESS_KEY,
            requestId,
            amount: amount.toString(),
            orderId,
            orderInfo,
            redirectUrl: MOMO_RETURN_URL,
            ipnUrl: MOMO_IPN_URL,
            extraData,
            requestType,
            signature,
            lang: 'vi'
        });

        const options = {
            hostname: 'test-payment.momo.vn',
            port: 443,
            path: '/v2/gateway/api/create',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        const momoReq = https.request(options, momoRes => {
            let data = '';
            momoRes.on('data', chunk => data += chunk);
            momoRes.on('end', () => {
                try {
                    const responseData = JSON.parse(data);
                    res.json(responseData);
                } catch(e) {
                    res.status(500).json({ message: 'Lỗi parse JSON từ MoMo' });
                }
            });
        });

        momoReq.on('error', (e) => {
            console.error('[MoMo Error]', e);
            res.status(500).json({ message: 'Lỗi kết nối MoMo' });
        });

        momoReq.write(requestBody);
        momoReq.end();
    } catch (err) {
        console.error('[MoMo Exception]', err);
        res.status(500).json({ message: err.message });
    }
});

// IPN Endpoint - MoMo gọi về để cập nhật trạng thái đơn hàng
app.post('/api/momo-ipn', async (req, res) => {
    const body = req.body || {};
    console.log('[MoMo IPN] Received:', body);

    const rawSignature =
        `accessKey=${MOMO_ACCESS_KEY}` +
        `&amount=${body.amount || ''}` +
        `&extraData=${body.extraData || ''}` +
        `&message=${body.message || ''}` +
        `&orderId=${body.orderId || ''}` +
        `&orderInfo=${body.orderInfo || ''}` +
        `&orderType=${body.orderType || ''}` +
        `&partnerCode=${body.partnerCode || ''}` +
        `&payType=${body.payType || ''}` +
        `&requestId=${body.requestId || ''}` +
        `&responseTime=${body.responseTime || ''}` +
        `&resultCode=${body.resultCode || ''}`;

    const verifySignature = crypto.createHmac('sha256', MOMO_SECRET_KEY)
        .update(rawSignature)
        .digest('hex');

    if (verifySignature !== (body.signature || '')) {
        console.warn('[MoMo IPN] Signature mismatch');
        return res.status(400).json({ status: 'invalid signature' });
    }

    const orderId = body.orderId;
    const resultCode = parseInt(body.resultCode || -1);

    try {
        if (resultCode === 0) {
            console.log(`[MoMo IPN] Order ${orderId} PAID successfully`);
            // Cập nhật trạng thái trong database
            await db.promise().query('UPDATE DONHANG SET TrangThai = ? WHERE MaDH = ?', ['Đã thanh toán', orderId]);
        } else {
            console.log(`[MoMo IPN] Order ${orderId} payment FAILED: ${body.message}`);
            await db.promise().query('UPDATE DONHANG SET TrangThai = ? WHERE MaDH = ?', ['Thanh toán thất bại', orderId]);
        }
    } catch (err) {
        console.error('[MoMo IPN] DB Update Error:', err);
    }

    return res.json({ status: 'OK' });
});

// Return Endpoint - MoMo redirect người dùng về đây
app.get('/api/momo-return', (req, res) => {
    const params = req.query || {};
    const resultCode = params.resultCode;

    // Redirect về trang lịch sử đơn hàng với thông báo
    if (resultCode == '0') {
        res.redirect('/#orders?status=success');
    } else {
        res.redirect('/#orders?status=failed');
    }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 100, // 100 requests/phút
    message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
});

// Handle CORS preflight requests BEFORE rate limiter
app.options(/\/api\/.*/, cors());

app.use('/api/', apiLimiter);

// JWT Middleware - xác thực token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Cần đăng nhập để thực hiện.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
        req.user = user;
        next();
    });
}

// Admin middleware
function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập.' });
    }
}

// Staff middleware (STAFF hoặc ADMIN đều được)
function requireStaff(req, res, next) {
    if (req.user && (req.user.role === 'STAFF' || req.user.role === 'ADMIN')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập.' });
    }
}

// Shipper middleware (SHIPPER hoặc ADMIN đều được)
function requireShipper(req, res, next) {
    if (req.user && (req.user.role === 'SHIPPER' || req.user.role === 'ADMIN')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập.' });
    }
}

// Staff hoặc Shipper middleware
function requireStaffOrShipper(req, res, next) {
    if (req.user && (req.user.role === 'STAFF' || req.user.role === 'SHIPPER' || req.user.role === 'ADMIN')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập.' });
    }
}

// API Verify Token để Frontend check auth real-time
app.get('/api/verify-token', authenticateToken, (req, res) => {
    // Nếu pass qua authenticateToken middleware, token còn hiệu lực
    res.json({
        success: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            customerId: req.user.customerId
        }
    });
});

// Input Sanitization helper
function sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[<>\"'`;]/g, '').trim();
}

// Serve static files (index.html, admin.html, styles.css, script.js)
app.use(express.static(path.join(__dirname, '..')));

// Serve images từ folder ảnh
app.use('/ảnh', express.static(path.join(__dirname, '..', 'ảnh')));
app.use('/anh', express.static(path.join(__dirname, '..', 'ảnh'))); // Alias không dấu

// Route cho index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Route cho admin.html - cần login
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Route cho login admin page
// Redirect /admin-login.html to main login
app.get('/admin-login.html', (req, res) => {
    res.redirect('/#login');
});

// KẾT NỐI DATABASE (secure via .env)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'thienduongsach',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- 1. API LẤY SÁCH (ĐÃ CẬP NHẬT ĐẦY ĐỦ) ---
app.get('/api/books', (req, res) => {
    const sql = `
        SELECT
            s.MaSach, s.TenSach, s.GiaBan, s.GiaGoc, s.MoTa, s.AnhBia, s.SoLuongTon, s.NgayXuatBan,
            s.SoTrang, s.ISBN, s.NgonNgu, -- Lấy thêm 3 cột này
            s.MaTL, tl.TenTL,
            ncc.TenNCC, -- Lấy tên Nhà xuất bản
            GROUP_CONCAT(tg.TenTG SEPARATOR ', ') AS TacGia,
            (SELECT COALESCE(SUM(ct.SoLuong), 0) FROM CHITIETDONHANG ct JOIN DONHANG dh ON ct.MaDonHang = dh.MaDH WHERE ct.MaSach = s.MaSach AND dh.TrangThai != 'Đã hủy') AS DaBan
        FROM SACH s
        LEFT JOIN THELOAI tl ON s.MaTL = tl.MaTL
        LEFT JOIN NHACUNGCAP ncc ON s.MaNCC = ncc.MaNCC -- JOIN thêm bảng NCC
        LEFT JOIN TACGIA_SACH tgs ON s.MaSach = tgs.MaSach
        LEFT JOIN TACGIA tg ON tgs.MaTG = tg.MaTG
        GROUP BY s.MaSach
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const books = results.map(b => ({
            id: b.MaSach,
            title: b.TenSach,
            author: b.TacGia || 'Đang cập nhật',
            price: Number(b.GiaBan),
            originalPrice: Number(b.GiaGoc),
            description: b.MoTa,
            // FIX: Tìm ảnh từ folder ảnh
            coverImage: getBookImage(b.TenTL, b.TenSach) || b.AnhBia || '/ảnh/book-placeholder.svg',
            category: b.TenTL,
            categoryId: b.MaTL,
            stockCount: b.SoLuongTon,
            inStock: b.SoLuongTon > 0,

            // --- CÁC TRƯỜNG MỚI ---
            soldCount: Number(b.DaBan) || 0,
            isbn: b.ISBN || 'Chưa có',
            pages: b.SoTrang || 'Chưa cập nhật',
            publisher: b.TenNCC || 'NXB Khác', // Map TenNCC vào publisher
            publishedDate: b.NgayXuatBan ? new Date(b.NgayXuatBan).getFullYear() : '2024', // Chỉ lấy năm
            language: b.NgonNgu || 'Tiếng Việt',

            // Tạo Tags giả từ Category để lấp đầy chỗ trống
            tags: [b.TenTL, 'Sách mới', 'Bán chạy']
        }));
        res.json({ books });
    });
});
// --- 2. API LẤY DANH MỤC (Đã sửa: Đếm số lượng sách thực tế) ---
app.get('/api/categories', (req, res) => {
    // Câu lệnh SQL đếm số sách (COUNT) theo từng Mã Thể Loại (MaTL)
    const sql = `
        SELECT tl.MaTL, tl.TenTL, tl.MoTa, COUNT(s.MaSach) AS SoLuongSach
        FROM THELOAI tl
        LEFT JOIN SACH s ON tl.MaTL = s.MaTL
        GROUP BY tl.MaTL
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const categories = results.map(c => ({
            id: c.MaTL,
            name: c.TenTL,
            description: c.MoTa,
            // Lấy số lượng sách thực tế từ Database
            bookCount: c.SoLuongSach,

            // Ảnh minh họa (Hardcode tạm vì bảng THELOAI chưa có cột ảnh, hoặc bạn có thể map theo ID)
            image: getCategoryImage(c.MaTL)
        }));
        res.json({ categories });
    });
});

// Hàm phụ trợ để lấy ảnh danh mục (Bạn có thể để ở cuối file server.js)
function getCategoryImage(id) {
    const images = {
        1: '/ảnh/danh mục/danh mục - tiểu thuyết.jpg',
        2: '/ảnh/danh mục/danh mục - phi tiểu thuyết.jpg',
        3: '/ảnh/danh mục/danh mục - khoa học viễn tưởng.jpg',
        4: '/ảnh/danh mục/danh mục - trinh thám & giật gân.jpg',
        5: '/ảnh/danh mục/danh mục - phát triển bản thân.jpg',
        6: '/ảnh/danh mục/danh mục - tiểu sử.jpg'
    };
    return images[id] || '/ảnh/book-placeholder.svg';
}

// Hàm tìm ảnh sách từ folder ảnh dựa trên tên sách
function getBookImage(categoryName, bookTitle) {
    try {
        // Normalize category name để match với folder names
        const categoryMap = {
            'Tiểu thuyết': 'tiểu thuyết',
            'Phi tiểu thuyết': 'phi-tiểu-thuyết',
            'Khoa học viễn tưởng': 'khoa học viễn tưởng',
            'Trinh thám & Giật gân': 'sách trinh thám & giật gân',
            'Phát triển bản thân': 'phát triển bản thân',
            'Tiểu sử': 'tieu-su',
            'Danh mục': 'danh mục',
            'Lựa chọn của nhân viên': 'lựa chọn của nhân viên'
        };

        const categoryFolder = categoryMap[categoryName] || categoryName;
        const categoryPath = path.join(__dirname, '..', 'ảnh', categoryFolder);

        if (fs.existsSync(categoryPath)) {
            const files = fs.readdirSync(categoryPath);
            // Tìm file ảnh có tên tương tự với tên sách
            for (const file of files) {
                if (file.toLowerCase().includes(bookTitle.toLowerCase().substring(0, 10))) {
                    return `/ảnh/${categoryFolder}/${file}`;
                }
            }
            // Nếu không tìm thấy sử dụng ảnh đầu tiên
            const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
            if (imageFiles.length > 0) {
                return `/ảnh/${categoryFolder}/${imageFiles[0]}`;
            }
        }
    } catch (err) {
        console.log('Lỗi tìm ảnh:', err.message);
    }
    return null;
}

// --- API ĐĂNG KÝ (Transaction: Tạo TK + Tạo KH) ---
app.post('/api/register', async (req, res) => {
    let { fullName, email, password } = req.body;

    // Sanitize inputs
    fullName = sanitizeInput(fullName);
    email = sanitizeInput(email);

    // Validate password strength
    if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự!' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Email không hợp lệ!' });
    }

    if (!fullName || fullName.length < 2) {
        return res.status(400).json({ success: false, message: 'Tên phải có ít nhất 2 ký tự!' });
    }

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        // 1. Kiểm tra Email đã tồn tại chưa
        const [rows] = await connection.query('SELECT * FROM TAIKHOAN WHERE Email = ?', [email]);
        if (rows.length > 0) {
            throw new Error('Email này đã được sử dụng!');
        }

        // 2. Tạo TAIKHOAN
        const hashedPassword = await bcrypt.hash(password, 12); // 12 rounds cho security tốt hơn
        const [resTK] = await connection.query(
            `INSERT INTO TAIKHOAN (Email, MatKhau, MaVaiTro, TrangThai) VALUES (?, ?, 'CUST', 1)`,
            [email, hashedPassword]
        );
        const maTK = resTK.insertId;

        // 3. Tạo KHACHHANG - MaKH ngắn gọn (max 8 ký tự)
        const maKH = 'KH' + String(maTK).padStart(4, '0');
        await connection.query(
            `INSERT INTO KHACHHANG (MaKH, TenKH, MaTK) VALUES (?, ?, ?)`,
            [maKH, fullName, maTK]
        );

        await connection.commit();
        res.json({ success: true, message: 'Đăng ký thành công!' });

    } catch (error) {
        await connection.rollback();
        console.error("Lỗi đăng ký:", error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// --- 3. API ĐĂNG NHẬP (JWT Token + Rate Limit) ---
app.post('/api/login', loginLimiter, (req, res) => {
    const email = sanitizeInput(req.body.email);
    const password = req.body.password;

    console.log(`[Login Attempt] Email: ${email}`);

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu!' });
    }

    // Lấy thông tin User + Khách hàng
    const sql = `
        SELECT TK.MaTK, TK.Email, TK.MatKhau, TK.MaVaiTro, KH.TenKH, KH.MaKH, KH.DiaChi, KH.SDT
        FROM TAIKHOAN TK
        LEFT JOIN KHACHHANG KH ON TK.MaTK = KH.MaTK
        WHERE TK.Email = ? AND TK.TrangThai = 1
    `;

    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error('[Login Error] DB:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        if (results.length === 0) {
            console.warn(`[Login Failed] User not found or blocked: ${email}`);
            return res.status(401).json({ success: false, message: 'Sai email hoặc mật khẩu!' });
        }

        const user = results[0];

        try {
            // So sánh mật khẩu
            const isMatch = await bcrypt.compare(password, user.MatKhau);
            if (!isMatch) {
                console.warn(`[Login Failed] Incorrect password for: ${email}`);
                return res.status(401).json({ success: false, message: 'Sai email hoặc mật khẩu!' });
            }

            // Tạo JWT Token
            const tokenPayload = {
                id: user.MaTK,
                email: user.Email,
                role: user.MaVaiTro,
                customerId: user.MaKH
            };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

            console.log(`[Login Success] User: ${email}, Role: ${user.MaVaiTro}`);

            res.json({
                success: true,
                token,
                user: {
                    id: user.MaTK,
                    name: user.TenKH || (user.MaVaiTro === 'ADMIN' ? 'Admin' : user.Email),
                    email: user.Email,
                    role: user.MaVaiTro,
                    customerId: user.MaKH,
                    phone: user.SDT || '',
                    address: user.DiaChi || ''
                }
            });
        } catch (bcryptErr) {
            console.error('[Login Error] Bcrypt comparison:', bcryptErr);
            res.status(500).json({ success: false, message: 'Lỗi xác thực hệ thống' });
        }
    });
});

// --- 4. API ĐẶT HÀNG (ĐÃ SỬA LỖI LƯU ĐỊA CHỈ) ---
app.post('/api/checkout', async (req, res) => {
    // Lấy address trực tiếp từ body (đây là chuỗi địa chỉ đầy đủ từ Frontend)
    const { userId, cartItems, totalAmount, address, customerInfo } = req.body;

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        // 1. TẠO ĐƠN HÀNG
        const maDH = 'DH' + Date.now();

        // FIX LỖI TỰ ĐỘNG GHI ĐÈ TÀI KHOẢN: Gộp thông tin người nhận vào địa chỉ giao hàng
        let finalAddress = 'Khách nhận tại cửa hàng';
        if (customerInfo && customerInfo.name) {
            finalAddress = `${customerInfo.name} - ${customerInfo.phone} - ${customerInfo.address || address}`;
            if (customerInfo.note) {
                finalAddress += ` (Ghi chú: ${customerInfo.note})`;
            }
        } else if (address) {
            finalAddress = address;
        }

        await connection.query(
            `INSERT INTO DONHANG (MaDH, NgayDat, TongTien, TrangThai, DiaChiGiao, MaKH)
             VALUES (?, NOW(), ?, 'Chờ xử lý', ?, ?)`,
            [maDH, totalAmount, finalAddress, userId]
        );

        // 2. LƯU CHI TIẾT & TRỪ KHO
        for (const item of cartItems) {
            const [upd] = await connection.query(
                `UPDATE SACH SET SoLuongTon = SoLuongTon - ? WHERE MaSach = ? AND SoLuongTon >= ?`,
                [item.quantity, item.bookId, item.quantity]
            );
            if (upd.affectedRows === 0) throw new Error(`Sản phẩm ${item.bookId} hết hàng!`);

            await connection.query(
                `INSERT INTO CHITIETDONHANG (MaDonHang, MaSach, SoLuong, DonGiaBan, ThanhTien)
                 VALUES (?, ?, ?, ?, ?)`,
                [maDH, item.bookId, item.quantity, item.price, item.quantity * item.price]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Đặt hàng thành công!', orderId: maDH });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// --- 5. API LẤY LỊCH SỬ ĐƠN HÀNG ---
app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId; // userId ở đây là MaKH

    // Lấy đơn hàng sắp xếp mới nhất lên đầu
    const sql = `
        SELECT MaDH, NgayDat, TongTien, TrangThai
        FROM DONHANG
        WHERE MaKH = ?
        ORDER BY NgayDat DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Format lại dữ liệu cho đẹp
        const orders = results.map(o => ({
            id: o.MaDH,
            date: new Date(o.NgayDat).toLocaleDateString('vi-VN'),
            total: Number(o.TongTien),
            status: o.TrangThai,
            // Tạo class màu sắc dựa trên trạng thái
            statusClass: o.TrangThai === 'Đã giao' ? 'status-delivered' :
                o.TrangThai === 'Đã hủy' ? 'status-cancelled' : 'status-shipping'
        }));

        res.json({ orders });
    });
});

// --- 6. API LẤY CHI TIẾT ĐƠN HÀNG (NÂNG CẤP) ---
app.get('/api/orders/detail/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    const connection = await db.promise().getConnection();

    try {
        // 1. Lấy thông tin chung đơn hàng
        const [orderRows] = await connection.query(
            `SELECT MaDH, NgayDat, TongTien, TrangThai, DiaChiGiao FROM DONHANG WHERE MaDH = ?`,
            [orderId]
        );

        if (orderRows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
        }

        // 2. Lấy danh sách sản phẩm
        const [itemRows] = await connection.query(`
            SELECT ct.SoLuong, ct.DonGiaBan, ct.ThanhTien, ct.MaSach,
                   s.TenSach, s.AnhBia
            FROM CHITIETDONHANG ct
            JOIN SACH s ON ct.MaSach = s.MaSach
            WHERE ct.MaDonHang = ?
        `, [orderId]);

        // 3. Trả về dữ liệu gộp
        res.json({
            info: {
                id: orderRows[0].MaDH,
                date: orderRows[0].NgayDat,
                total: Number(orderRows[0].TongTien),
                status: orderRows[0].TrangThai,
                address: orderRows[0].DiaChiGiao
            },
            items: itemRows.map(item => ({
                bookId: item.MaSach,
                title: item.TenSach,
                coverImage: item.AnhBia || 'https://via.placeholder.com/100x150',
                quantity: item.SoLuong,
                price: Number(item.DonGiaBan),
                total: Number(item.ThanhTien)
            }))
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// --- 7. API HỦY ĐƠN HÀNG (CÓ HOÀN TRẢ KHO) ---
app.post('/api/orders/cancel', authenticateToken, async (req, res) => {
    const { orderId } = req.body;
    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        // 1. Kiểm tra trạng thái hiện tại & quyền sở hữu
        const [rows] = await connection.query('SELECT TrangThai, MaKH FROM DONHANG WHERE MaDH = ?', [orderId]);
        if (rows.length === 0) throw new Error('Đơn hàng không tồn tại');

        if (req.user.role === 'CUST' && req.user.customerId !== rows[0].MaKH) {
            throw new Error('Bạn không có quyền hủy đơn hàng này');
        }

        const currentStatus = rows[0].TrangThai;
        if (currentStatus !== 'Chờ xử lý') {
            throw new Error('Chỉ có thể hủy đơn hàng khi đang chờ xử lý!');
        }

        // 2. Cập nhật trạng thái đơn hàng thành 'Đã hủy'
        await connection.query('UPDATE DONHANG SET TrangThai = ? WHERE MaDH = ?', ['Đã hủy', orderId]);

        // 3. Lấy danh sách sách trong đơn để hoàn kho
        const [items] = await connection.query('SELECT MaSach, SoLuong FROM CHITIETDONHANG WHERE MaDonHang = ?', [orderId]);

        // 4. Cộng lại số lượng tồn kho
        for (const item of items) {
            await connection.query(
                'UPDATE SACH SET SoLuongTon = SoLuongTon + ? WHERE MaSach = ?',
                [item.SoLuong, item.MaSach]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Đã hủy đơn hàng thành công!' });

    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ============================================================
// ===== ADMIN APIs ==========================================
// ============================================================

// --- ADMIN: Lấy tất cả đơn hàng + tên khách hàng ---
app.get('/api/admin/orders', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [orders] = await db.promise().query(`
            SELECT dh.MaDH, dh.NgayDat, dh.TongTien, dh.TrangThai, dh.DiaChiGiao,
                   dh.MaKH, kh.TenKH
            FROM DONHANG dh
            LEFT JOIN KHACHHANG kh ON dh.MaKH = kh.MaKH
            ORDER BY dh.NgayDat DESC
        `);

        const [[custCount]] = await db.promise().query(`SELECT COUNT(*) as total FROM KHACHHANG`);

        const formatted = orders.map(o => ({
            id: o.MaDH,
            date: o.NgayDat,
            total: Number(o.TongTien),
            status: o.TrangThai,
            address: o.DiaChiGiao,
            customerId: o.MaKH,
            customerName: o.TenKH || 'Khách lẻ'
        }));

        res.json({ orders: formatted, totalCustomers: custCount.total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: Cập nhật trạng thái đơn hàng ---
app.post('/api/admin/orders/status', authenticateToken, requireStaff, async (req, res) => {
    const { orderId, status } = req.body;
    const validStatuses = ['Chờ xử lý', 'Chờ lấy hàng', 'Đang giao', 'Đã giao', 'Đã hủy'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();

        const [[order]] = await connection.query('SELECT TrangThai FROM DONHANG WHERE MaDH = ?', [orderId]);
        if (!order) throw new Error('Đơn hàng không tồn tại');

        // Nếu hủy đơn đang chờ → hoàn kho
        if (status === 'Đã hủy' && order.TrangThai === 'Chờ xử lý') {
            const [items] = await connection.query('SELECT MaSach, SoLuong FROM CHITIETDONHANG WHERE MaDonHang = ?', [orderId]);
            for (const item of items) {
                await connection.query('UPDATE SACH SET SoLuongTon = SoLuongTon + ? WHERE MaSach = ?', [item.SoLuong, item.MaSach]);
            }
        }

        await connection.query('UPDATE DONHANG SET TrangThai = ? WHERE MaDH = ?', [status, orderId]);
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(400).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// --- ADMIN: Lấy danh sách khách hàng + thống kê ---
app.get('/api/admin/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [customers] = await db.promise().query(`
            SELECT
                kh.MaKH, kh.TenKH, kh.DiaChi,
                tk.Email, kh.SDT,
                COUNT(dh.MaDH) AS SoDonHang,
                COALESCE(SUM(CASE WHEN dh.TrangThai = 'Đã giao' THEN dh.TongTien ELSE 0 END), 0) AS TongChiTieu
            FROM KHACHHANG kh
            LEFT JOIN TAIKHOAN tk ON kh.MaTK = tk.MaTK
            LEFT JOIN DONHANG dh ON kh.MaKH = dh.MaKH
            GROUP BY kh.MaKH
            ORDER BY TongChiTieu DESC
        `);

        const formatted = customers.map(c => ({
            id: c.MaKH,
            name: c.TenKH || '—',
            email: c.Email || '—',
            phone: c.SDT || '—',
            address: c.DiaChi || '—',
            orderCount: c.SoDonHang,
            totalSpent: Number(c.TongChiTieu)
        }));

        res.json({ customers: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 5. API KHỞI TẠO ADMIN (Dùng lần đầu tiên) ---
app.post('/api/create-admin', async (req, res) => {
    const { email, password } = req.body;
    const connection = await db.promise().getConnection();

    try {
        // Kiểm tra admin đã tồn tại chưa
        const [rows] = await connection.query('SELECT * FROM TAIKHOAN WHERE MaVaiTro = ?', ['ADMIN']);
        if (rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Admin đã tồn tại!' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Tạo tài khoản admin
        await connection.query(
            'INSERT INTO TAIKHOAN (Email, MatKhau, MaVaiTro, TrangThai) VALUES (?, ?, ?, ?)',
            [email, hashedPassword, 'ADMIN', 1]
        );

        res.json({ success: true, message: 'Admin được tạo thành công!' });
    } catch (error) {
        console.error(error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// --- ADMIN: Lấy dashboard stats (NÂNG CẤP) ---
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Tổng doanh thu (đã giao)
        const [[revenue]] = await db.promise().query(`
            SELECT COALESCE(SUM(TongTien), 0) as total FROM DONHANG WHERE TrangThai = 'Đã giao'
        `);

        // Doanh thu hôm nay
        const [[todayRevenue]] = await db.promise().query(`
            SELECT COALESCE(SUM(TongTien), 0) as total FROM DONHANG WHERE TrangThai = 'Đã giao' AND DATE(NgayDat) = CURDATE()
        `);

        // Doanh thu tháng này
        const [[monthRevenue]] = await db.promise().query(`
            SELECT COALESCE(SUM(TongTien), 0) as total FROM DONHANG
            WHERE TrangThai = 'Đã giao' AND MONTH(NgayDat) = MONTH(CURDATE()) AND YEAR(NgayDat) = YEAR(CURDATE())
        `);

        // Doanh thu tháng trước (để so sánh)
        const [[lastMonthRevenue]] = await db.promise().query(`
            SELECT COALESCE(SUM(TongTien), 0) as total FROM DONHANG
            WHERE TrangThai = 'Đã giao' AND MONTH(NgayDat) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
            AND YEAR(NgayDat) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
        `);

        // Đơn hàng hôm nay
        const [[todayOrders]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM DONHANG WHERE DATE(NgayDat) = CURDATE()
        `);

        // Đơn hàng đang chờ xử lý
        const [[pendingOrders]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM DONHANG WHERE TrangThai = 'Chờ xử lý'
        `);

        // Tổng khách hàng
        const [[customers]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM KHACHHANG
        `);

        // Khách hàng mới tháng này
        const [[newCustomers]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM TAIKHOAN
            WHERE MaVaiTro = 'CUST' AND MaTK IN (SELECT MaTK FROM KHACHHANG)
        `);

        // Tổng sách
        const [[books]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM SACH
        `);

        // Tổng hàng tồn
        const [[stock]] = await db.promise().query(`
            SELECT COALESCE(SUM(SoLuongTon), 0) as total FROM SACH
        `);

        // Sách sắp hết hàng (tồn kho < 5)
        const [[lowStock]] = await db.promise().query(`
            SELECT COUNT(*) as count FROM SACH WHERE SoLuongTon > 0 AND SoLuongTon < 5
        `);

        // Doanh thu 7 ngày gần nhất (cho mini chart)
        const [weeklyRevenue] = await db.promise().query(`
            SELECT DATE_FORMAT(NgayDat, '%Y-%m-%d') as date,
                   COALESCE(SUM(CASE WHEN TrangThai = 'Đã giao' THEN TongTien ELSE 0 END), 0) as revenue,
                   COUNT(*) as orders
            FROM DONHANG
            WHERE NgayDat >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE_FORMAT(NgayDat, '%Y-%m-%d')
            ORDER BY date ASC
        `);

        // Phân bố trạng thái đơn hàng
        const [orderStatusDist] = await db.promise().query(`
            SELECT TrangThai as status, COUNT(*) as count FROM DONHANG GROUP BY TrangThai
        `);

        // Top 5 sách bán chạy
        const [topBooks] = await db.promise().query(`
            SELECT s.MaSach, s.TenSach, s.GiaBan, s.AnhBia,
                   COALESCE(SUM(ct.SoLuong), 0) as sold,
                   COALESCE(SUM(ct.ThanhTien), 0) as revenue
            FROM SACH s
            LEFT JOIN CHITIETDONHANG ct ON s.MaSach = ct.MaSach
            LEFT JOIN DONHANG dh ON ct.MaDonHang = dh.MaDH AND dh.TrangThai != 'Đã hủy'
            GROUP BY s.MaSach
            ORDER BY sold DESC
            LIMIT 5
        `);

        // Tính % tăng trưởng
        const lastMonthVal = Number(lastMonthRevenue.total);
        const thisMonthVal = Number(monthRevenue.total);
        const growthPercent = lastMonthVal > 0 ? Math.round(((thisMonthVal - lastMonthVal) / lastMonthVal) * 100) : (thisMonthVal > 0 ? 100 : 0);

        res.json({
            stats: {
                revenue: Number(revenue.total),
                todayRevenue: Number(todayRevenue.total),
                monthRevenue: thisMonthVal,
                lastMonthRevenue: lastMonthVal,
                growthPercent,
                todayOrders: todayOrders.count,
                pendingOrders: pendingOrders.count,
                totalCustomers: customers.count,
                newCustomers: newCustomers.count,
                totalBooks: books.count,
                totalStock: stock.total,
                lowStock: lowStock.count
            },
            weeklyRevenue,
            orderStatusDist,
            topBooks: topBooks.map(b => ({
                id: b.MaSach,
                title: b.TenSach,
                price: Number(b.GiaBan),
                coverImage: b.AnhBia,
                sold: b.sold || 0,
                revenue: Number(b.revenue) || 0
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: Cập nhật trạng thái đơn hàng (endpoint chính, có hoàn kho) ---
app.post('/api/admin/orders/update-status', authenticateToken, requireStaffOrShipper, async (req, res) => {
    const { orderId, status } = req.body;
    const validStatuses = ['Chờ xử lý', 'Chờ lấy hàng', 'Đang giao', 'Đã giao', 'Đã hủy'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [[order]] = await connection.query('SELECT TrangThai FROM DONHANG WHERE MaDH = ?', [orderId]);
        if (!order) throw new Error('Đơn hàng không tồn tại');
        // Nếu hủy đơn chưa giao → hoàn kho
        if (status === 'Đã hủy' && ['Chờ xử lý', 'Chờ lấy hàng'].includes(order.TrangThai)) {
            const [items] = await connection.query('SELECT MaSach, SoLuong FROM CHITIETDONHANG WHERE MaDonHang = ?', [orderId]);
            for (const item of items) {
                await connection.query('UPDATE SACH SET SoLuongTon = SoLuongTon + ? WHERE MaSach = ?', [item.SoLuong, item.MaSach]);
            }
        }
        await connection.query('UPDATE DONHANG SET TrangThai = ? WHERE MaDH = ?', [status, orderId]);
        await connection.commit();
        res.json({ success: true, message: 'Đã cập nhật trạng thái' });
    } catch (err) {
        await connection.rollback();
        res.status(400).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// --- ADMIN: Xóa sách (AN TOÀN - không xóa lịch sử đơn hàng) ---
app.delete('/api/admin/books/:id', authenticateToken, requireAdmin, async (req, res) => {
    const id = req.params.id;
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query('SELECT COUNT(*) as c FROM CHITIETDONHANG WHERE MaSach = ?', [id]);
        if (orders[0].c > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Không thể xóa: sách có trong ${orders[0].c} đơn hàng. Hãy ẩn sách thay vì xóa.` });
        }

        const [imports] = await connection.query('SELECT COUNT(*) as c FROM CHITIETPHIEUNHAP WHERE MaSach = ?', [id]);
        if (imports[0].c > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Không thể xóa: sách có trong ${imports[0].c} phiếu nhập. Hãy ẩn sách thay vì xóa.` });
        }
        await connection.query('DELETE FROM TACGIA_SACH WHERE MaSach = ?', [id]);
        await connection.query('DELETE FROM SACH WHERE MaSach = ?', [id]);
        await connection.commit();
        res.json({ success: true, message: 'Xóa sách thành công' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// --- SHIPPER: Lấy đơn hàng cần giao ---
app.get('/api/shipper/orders', authenticateToken, requireShipper, async (req, res) => {
    try {
        const [orders] = await db.promise().query(`
            SELECT dh.MaDH, dh.NgayDat, dh.TongTien, dh.TrangThai, dh.DiaChiGiao,
                   kh.TenKH, kh.SDT, kh.MaKH
            FROM DONHANG dh
            LEFT JOIN KHACHHANG kh ON dh.MaKH = kh.MaKH
            WHERE dh.TrangThai IN ('Chờ xử lý', 'Chờ lấy hàng', 'Đang giao', 'Đã giao', 'Đã hủy')
            ORDER BY dh.NgayDat DESC
            LIMIT 100
        `);

        // Lấy chi tiết từng đơn hàng (sách trong đơn)
        const ordersWithDetails = await Promise.all(orders.map(async (order) => {
            const [items] = await db.promise().query(`
                SELECT ct.SoLuong, ct.ThanhTien, s.TenSach
                FROM CHITIETDONHANG ct
                JOIN SACH s ON ct.MaSach = s.MaSach
                WHERE ct.MaDonHang = ?
            `, [order.MaDH]);
            return { ...order, items };
        }));

        res.json({ orders: ordersWithDetails });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: Thống kê real-time cho trang chủ ---
app.get('/api/site-stats', async (req, res) => {
    try {
        const [[customers]] = await db.promise().query('SELECT COUNT(*) as count FROM KHACHHANG');
        const [[books]] = await db.promise().query('SELECT COUNT(*) as count FROM SACH');
        const [[categories]] = await db.promise().query('SELECT COUNT(*) as count FROM THELOAI');
        const [[orders]] = await db.promise().query("SELECT COUNT(*) as count FROM DONHANG WHERE TrangThai != 'Đã hủy'");
        res.json({
            totalCustomers: customers.count || 0,
            totalBooks: books.count || 0,
            totalCategories: categories.count || 0,
            totalOrders: orders.count || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ===== STAFF APIs ============================================
// ============================================================

// --- STAFF: Upload ảnh bìa sách ---
app.post('/api/staff/upload-image', authenticateToken, requireStaff, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    const relativePath = 'ảnh/uploads/' + req.file.filename;
    res.json({ success: true, path: relativePath, filename: req.file.filename });
});

// --- STAFF: CRUD Thể loại ---
app.get('/api/staff/categories', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT MaTL, TenTL, MoTa FROM THELOAI ORDER BY MaTL');
        res.json({ categories: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/staff/categories', authenticateToken, requireStaff, async (req, res) => {
    const { name, description } = req.body;
    try {
        const [result] = await db.promise().query('INSERT INTO THELOAI (TenTL, MoTa) VALUES (?, ?)', [name, description || '']);
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/staff/categories/:id', authenticateToken, requireStaff, async (req, res) => {
    const { name, description } = req.body;
    try {
        await db.promise().query('UPDATE THELOAI SET TenTL = ?, MoTa = ? WHERE MaTL = ?', [name, description || '', req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/staff/categories/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [books] = await db.promise().query('SELECT COUNT(*) as c FROM SACH WHERE MaTL = ?', [req.params.id]);
        if (books[0].c > 0) return res.status(400).json({ success: false, message: `Không thể xóa: có ${books[0].c} sách thuộc thể loại này` });
        await db.promise().query('DELETE FROM THELOAI WHERE MaTL = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- STAFF: CRUD Tác giả ---
app.get('/api/staff/authors', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT tg.MaTG, tg.TenTG, tg.TieuSu, COUNT(ts.MaSach) as SoSach
            FROM TACGIA tg LEFT JOIN TACGIA_SACH ts ON tg.MaTG = ts.MaTG
            GROUP BY tg.MaTG ORDER BY tg.TenTG
        `);
        res.json({ authors: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/staff/authors', authenticateToken, requireStaff, async (req, res) => {
    const { name, bio } = req.body;
    try {
        const [result] = await db.promise().query('INSERT INTO TACGIA (TenTG, TieuSu) VALUES (?, ?)', [name, bio || '']);
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/staff/authors/:id', authenticateToken, requireStaff, async (req, res) => {
    const { name, bio } = req.body;
    try {
        await db.promise().query('UPDATE TACGIA SET TenTG = ?, TieuSu = ? WHERE MaTG = ?', [name, bio || '', req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/staff/authors/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [links] = await db.promise().query('SELECT COUNT(*) as c FROM TACGIA_SACH WHERE MaTG = ?', [req.params.id]);
        if (links[0].c > 0) return res.status(400).json({ success: false, message: `Không thể xóa: tác giả đang liên kết với ${links[0].c} sách` });
        await db.promise().query('DELETE FROM TACGIA WHERE MaTG = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- STAFF: CRUD Nhà cung cấp ---
app.get('/api/staff/suppliers', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT MaNCC, TenNCC, DiaChi, SDT, Email, MaSoThue FROM NHACUNGCAP ORDER BY MaNCC');
        res.json({ suppliers: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/staff/suppliers', authenticateToken, requireStaff, async (req, res) => {
    const { id, name, address, phone, email, taxCode } = req.body;
    try {
        await db.promise().query('INSERT INTO NHACUNGCAP (MaNCC, TenNCC, DiaChi, SDT, Email, MaSoThue) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, address || '', phone || '', email || '', taxCode || '']);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/staff/suppliers/:id', authenticateToken, requireStaff, async (req, res) => {
    const { name, address, phone, email, taxCode } = req.body;
    try {
        await db.promise().query('UPDATE NHACUNGCAP SET TenNCC=?, DiaChi=?, SDT=?, Email=?, MaSoThue=? WHERE MaNCC=?',
            [name, address || '', phone || '', email || '', taxCode || '', req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/staff/suppliers/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [imports] = await db.promise().query('SELECT COUNT(*) as c FROM PHIEUNHAP WHERE MaNCC = ?', [req.params.id]);
        if (imports[0].c > 0) return res.status(400).json({ success: false, message: `Không thể xóa: nhà cung cấp này đã có ${imports[0].c} phiếu nhập trong hệ thống` });

        await db.promise().query('DELETE FROM NHACUNGCAP WHERE MaNCC = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- STAFF: Nhập kho ---
app.post('/api/staff/imports', authenticateToken, requireStaff, async (req, res) => {
    const { supplierId, items, note } = req.body;
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const maPN = 'PN' + Date.now().toString().slice(-8);
        const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.price), 0);

        await connection.query(
            'INSERT INTO PHIEUNHAP (MaPN, NgayNhap, MaNCC, TongTienNhap, GhiChu) VALUES (?, NOW(), ?, ?, ?)',
            [maPN, supplierId, totalAmount, note || '']
        );

        for (const item of items) {
            await connection.query(
                'INSERT INTO CHITIETPHIEUNHAP (MaPN, MaSach, SoLuongNhap, GiaNhap, ThanhTien) VALUES (?, ?, ?, ?, ?)',
                [maPN, item.bookId, item.quantity, item.price, item.quantity * item.price]
            );
            await connection.query(
                'UPDATE SACH SET SoLuongTon = SoLuongTon + ? WHERE MaSach = ?',
                [item.quantity, item.bookId]
            );
        }

        await connection.commit();
        res.json({ success: true, importId: maPN, total: totalAmount });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

app.get('/api/staff/imports', authenticateToken, requireStaff, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT pn.MaPN, pn.NgayNhap, pn.TongTienNhap, pn.GhiChu,
                   ncc.TenNCC, COUNT(ct.MaSach) as SoMatHang
            FROM PHIEUNHAP pn
            LEFT JOIN NHACUNGCAP ncc ON pn.MaNCC = ncc.MaNCC
            LEFT JOIN CHITIETPHIEUNHAP ct ON pn.MaPN = ct.MaPN
            GROUP BY pn.MaPN
            ORDER BY pn.NgayNhap DESC
        `);
        res.json({ imports: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- STAFF: Thêm sách mới (có upload ảnh) ---
app.post('/api/staff/books', authenticateToken, requireStaff, async (req, res) => {
    const { title, price, originalPrice, description, stock, categoryId, supplierId, isbn, pages, language, publishedDate, coverImage, authorId } = req.body;
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        // Tạo mã sách tự động
        const [[maxId]] = await connection.query("SELECT MAX(CAST(SUBSTRING(MaSach, 2) AS UNSIGNED)) as maxNum FROM SACH");
        const nextNum = (maxId.maxNum || 0) + 1;
        const maSach = 'S' + String(nextNum).padStart(3, '0');

        await connection.query(
            `INSERT INTO SACH (MaSach, TenSach, GiaBan, GiaGoc, MoTa, SoLuongTon, MaTL, MaNCC, ISBN, SoTrang, NgonNgu, NgayXuatBan, AnhBia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [maSach, title, price, originalPrice || 0, description || '', stock || 0, categoryId, supplierId || null, isbn || null, pages || null, language || 'Tiếng Việt', publishedDate || null, coverImage || '']
        );

        if (authorId) {
            await connection.query('INSERT INTO TACGIA_SACH (MaSach, MaTG, VaiTro) VALUES (?, ?, ?)', [maSach, authorId, 'Tác giả']);
        }

        await connection.commit();
        res.json({ success: true, bookId: maSach });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// --- STAFF: Sửa sách ---
app.put('/api/staff/books/:id', authenticateToken, requireStaff, async (req, res) => {
    const { title, price, originalPrice, description, stock, categoryId, supplierId, isbn, pages, language, publishedDate, coverImage, authorId } = req.body;
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(
            `UPDATE SACH SET TenSach=?, GiaBan=?, GiaGoc=?, MoTa=?, SoLuongTon=?, MaTL=?, MaNCC=?, ISBN=?, SoTrang=?, NgonNgu=?, NgayXuatBan=?, AnhBia=? WHERE MaSach=?`,
            [title, price, originalPrice || 0, description || '', stock || 0, categoryId, supplierId || null, isbn || null, pages || null, language || 'Tiếng Việt', publishedDate || null, coverImage || '', req.params.id]
        );
        if (authorId) {
            await connection.query('DELETE FROM TACGIA_SACH WHERE MaSach = ?', [req.params.id]);
            await connection.query('INSERT INTO TACGIA_SACH (MaSach, MaTG, VaiTro) VALUES (?, ?, ?)', [req.params.id, authorId, 'Tác giả']);
        }
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// --- STAFF: Xóa sách ---
app.delete('/api/staff/books/:id', authenticateToken, requireStaff, async (req, res) => {
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query('SELECT COUNT(*) as c FROM CHITIETDONHANG WHERE MaSach = ?', [req.params.id]);
        if (orders[0].c > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Không thể xóa: sách có trong ${orders[0].c} đơn hàng` });
        }

        const [imports] = await connection.query('SELECT COUNT(*) as c FROM CHITIETPHIEUNHAP WHERE MaSach = ?', [req.params.id]);
        if (imports[0].c > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Không thể xóa: sách có trong ${imports[0].c} phiếu nhập` });
        }
        await connection.query('DELETE FROM TACGIA_SACH WHERE MaSach = ?', [req.params.id]);
        await connection.query('DELETE FROM SACH WHERE MaSach = ?', [req.params.id]);
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// ============================================================
// ===== ADMIN: QUẢN LÝ NGƯỜI DÙNG ============================
// ============================================================

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT tk.MaTK, tk.Email, tk.MaVaiTro, tk.TrangThai,
                   COALESCE(kh.TenKH, nv.TenNV, ngh.TenNV, tk.Email) as TenNguoiDung,
                   vt.TenVaiTro
            FROM TAIKHOAN tk
            LEFT JOIN KHACHHANG kh ON tk.MaTK = kh.MaTK
            LEFT JOIN NHANVIEN nv ON tk.MaTK = nv.MaTK
            LEFT JOIN NGUOIGIAOHANG ngh ON tk.MaTK = ngh.MaTK
            LEFT JOIN VAITRO vt ON tk.MaVaiTro = vt.MaVaiTro
            ORDER BY tk.MaTK
        `);
        res.json({ users: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { email, password, fullName, role } = req.body;
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();
        const [exists] = await connection.query('SELECT MaTK FROM TAIKHOAN WHERE Email = ?', [email]);
        if (exists.length > 0) throw new Error('Email đã tồn tại');

        const hashedPwd = await bcrypt.hash(password, 12);
        const [result] = await connection.query(
            'INSERT INTO TAIKHOAN (Email, MatKhau, MaVaiTro, TrangThai) VALUES (?, ?, ?, 1)',
            [email, hashedPwd, role]
        );
        const maTK = result.insertId;

        if (role === 'CUST') {
            const maKH = 'KH' + String(maTK).padStart(4, '0');
            await connection.query('INSERT INTO KHACHHANG (MaKH, TenKH, MaTK) VALUES (?, ?, ?)', [maKH, fullName, maTK]);
        } else if (role === 'STAFF') {
            const maNV = 'NV' + String(maTK).padStart(4, '0');
            await connection.query('INSERT INTO NHANVIEN (MaNV, TenNV, ChucVu, MaTK) VALUES (?, ?, ?, ?)', [maNV, fullName, 'Nhân viên', maTK]);
        } else if (role === 'SHIPPER') {
            const maNV = 'SH' + String(maTK).padStart(4, '0');
            await connection.query('INSERT INTO NGUOIGIAOHANG (MaNV, TenNV, MaTK) VALUES (?, ?, ?)', [maNV, fullName, maTK]);
        }

        await connection.commit();
        res.json({ success: true, userId: maTK });
    } catch (err) {
        await connection.rollback();
        res.status(400).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await db.promise().query('UPDATE TAIKHOAN SET TrangThai = ? WHERE MaTK = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    const { role } = req.body;
    try {
        await db.promise().query('UPDATE TAIKHOAN SET MaVaiTro = ? WHERE MaTK = ?', [role, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/users/:id/reset-pwd', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const defaultPwd = await bcrypt.hash('123456', 12);
        await db.promise().query('UPDATE TAIKHOAN SET MatKhau = ? WHERE MaTK = ?', [defaultPwd, req.params.id]);
        res.json({ success: true, message: 'Đã reset mật khẩu về 123456' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// ===== ADMIN: BÁO CÁO DOANH THU ============================
// ============================================================

// --- REPORTS: Doanh thu (HỖ TRỢ DATE RANGE) ---
app.get('/api/admin/reports/revenue', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to, groupBy } = req.query;
        let dateFilter = 'NgayDat >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';
        const params = [];
        if (from && to) {
            dateFilter = 'NgayDat >= ? AND NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(from, to);
        }
        // Auto-detect groupBy based on range or use explicit param
        let groupFormat = "'%Y-%m'";
        let groupLabel = 'month';
        if (groupBy === 'day') { groupFormat = "'%Y-%m-%d'"; groupLabel = 'date'; }
        else if (groupBy === 'week') { groupFormat = "'%Y-W%u'"; groupLabel = 'week'; }

        const [rows] = await db.promise().query(`
            SELECT DATE_FORMAT(NgayDat, ${groupFormat}) as label,
                   SUM(CASE WHEN TrangThai = 'Đã giao' THEN TongTien ELSE 0 END) as revenue,
                   COUNT(*) as orders,
                   SUM(CASE WHEN TrangThai = 'Đã giao' THEN 1 ELSE 0 END) as deliveredOrders
            FROM DONHANG
            WHERE ${dateFilter}
            GROUP BY label
            ORDER BY label ASC
        `, params);
        res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPORTS: Top sách bán chạy (HỖ TRỢ DATE RANGE) ---
app.get('/api/admin/reports/top-books', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to, limit } = req.query;
        let dateFilter = '';
        const params = [];
        if (from && to) {
            dateFilter = 'AND dh.NgayDat >= ? AND dh.NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(from, to);
        }
        const bookLimit = parseInt(limit) || 10;
        params.push(bookLimit);

        const [rows] = await db.promise().query(`
            SELECT s.MaSach, s.TenSach, s.GiaBan, s.AnhBia,
                   SUM(ct.SoLuong) as totalSold,
                   SUM(ct.ThanhTien) as totalRevenue
            FROM CHITIETDONHANG ct
            JOIN SACH s ON ct.MaSach = s.MaSach
            JOIN DONHANG dh ON ct.MaDonHang = dh.MaDH
            WHERE dh.TrangThai != 'Đã hủy' ${dateFilter}
            GROUP BY s.MaSach
            ORDER BY totalSold DESC
            LIMIT ?
        `, params);
        res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPORTS: Doanh thu theo thể loại (HỖ TRỢ DATE RANGE) ---
app.get('/api/admin/reports/by-category', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to } = req.query;
        let dateFilter = '';
        const params = [];
        if (from && to) {
            dateFilter = 'AND dh.NgayDat >= ? AND dh.NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(from, to);
        }
        const [rows] = await db.promise().query(`
            SELECT tl.TenTL as category,
                   SUM(ct.ThanhTien) as revenue,
                   SUM(ct.SoLuong) as quantity
            FROM CHITIETDONHANG ct
            JOIN SACH s ON ct.MaSach = s.MaSach
            JOIN THELOAI tl ON s.MaTL = tl.MaTL
            JOIN DONHANG dh ON ct.MaDonHang = dh.MaDH
            WHERE dh.TrangThai != 'Đã hủy' ${dateFilter}
            GROUP BY tl.MaTL
            ORDER BY revenue DESC
        `, params);
        res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPORTS: Thống kê đơn hàng (HỖ TRỢ DATE RANGE) ---
app.get('/api/admin/reports/order-stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to } = req.query;
        let dateFilter = '';
        const params = [];
        if (from && to) {
            dateFilter = 'WHERE NgayDat >= ? AND NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(from, to);
        }
        const [rows] = await db.promise().query(`
            SELECT TrangThai as status, COUNT(*) as count,
                   SUM(TongTien) as total
            FROM DONHANG ${dateFilter} GROUP BY TrangThai
        `, params);
        res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPORTS: Summary (HỖ TRỢ DATE RANGE + SO SÁNH KỲ TRƯỚC) ---
app.get('/api/admin/reports/summary', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to } = req.query;
        let dateFilter = '';
        let prevDateFilter = '';
        const params = [];
        const prevParams = [];

        if (from && to) {
            dateFilter = "AND NgayDat >= ? AND NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)";
            params.push(from, to);
            // Tính khoảng thời gian tương đương kỳ trước
            const fromDate = new Date(from);
            const toDate = new Date(to);
            const diffMs = toDate - fromDate;
            const prevTo = new Date(fromDate.getTime() - 1);
            const prevFrom = new Date(prevTo.getTime() - diffMs);
            prevDateFilter = "AND NgayDat >= ? AND NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)";
            prevParams.push(prevFrom.toISOString().split('T')[0], prevTo.toISOString().split('T')[0]);
        }

        // Kỳ hiện tại
        const [[rev]] = await db.promise().query(`SELECT COALESCE(SUM(TongTien),0) as t FROM DONHANG WHERE TrangThai='Đã giao' ${dateFilter}`, params);
        const [[orders]] = await db.promise().query(`SELECT COUNT(*) as c FROM DONHANG WHERE TrangThai != 'Đã hủy' ${dateFilter}`, params);
        const [[totalOrders]] = await db.promise().query(`SELECT COUNT(*) as c FROM DONHANG WHERE 1=1 ${dateFilter}`, params);

        // Kỳ trước (để so sánh)
        const [[prevRev]] = await db.promise().query(`SELECT COALESCE(SUM(TongTien),0) as t FROM DONHANG WHERE TrangThai='Đã giao' ${prevDateFilter}`, prevParams);
        const [[prevOrd]] = await db.promise().query(`SELECT COUNT(*) as c FROM DONHANG WHERE TrangThai != 'Đã hủy' ${prevDateFilter}`, prevParams);

        const [[newCust]] = await db.promise().query("SELECT COUNT(*) as c FROM TAIKHOAN WHERE MaVaiTro='CUST' AND MaTK IN (SELECT MaTK FROM KHACHHANG)");

        const currentRevenue = Number(rev.t);
        const previousRevenue = Number(prevRev.t);
        const avg = orders.c > 0 ? Math.round(currentRevenue / orders.c) : 0;
        const revenueGrowth = previousRevenue > 0 ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100) : (currentRevenue > 0 ? 100 : 0);
        const orderGrowth = prevOrd.c > 0 ? Math.round(((orders.c - prevOrd.c) / prevOrd.c) * 100) : (orders.c > 0 ? 100 : 0);

        res.json({
            revenue: currentRevenue,
            previousRevenue,
            revenueGrowth,
            orders: orders.c,
            totalOrders: totalOrders.c,
            previousOrders: prevOrd.c,
            orderGrowth,
            newCustomers: newCust.c,
            avgOrderValue: avg
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPORTS: Top khách hàng chi tiêu ---
app.get('/api/admin/reports/top-customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { from, to, limit } = req.query;
        let dateFilter = '';
        const params = [];
        if (from && to) {
            dateFilter = "AND dh.NgayDat >= ? AND dh.NgayDat <= DATE_ADD(?, INTERVAL 1 DAY)";
            params.push(from, to);
        }
        const custLimit = parseInt(limit) || 5;
        params.push(custLimit);

        const [rows] = await db.promise().query(`
            SELECT kh.MaKH, kh.TenKH, tk.Email,
                   COUNT(dh.MaDH) as totalOrders,
                   COALESCE(SUM(CASE WHEN dh.TrangThai = 'Đã giao' THEN dh.TongTien ELSE 0 END), 0) as totalSpent
            FROM KHACHHANG kh
            LEFT JOIN TAIKHOAN tk ON kh.MaTK = tk.MaTK
            LEFT JOIN DONHANG dh ON kh.MaKH = dh.MaKH
            WHERE 1=1 ${dateFilter}
            GROUP BY kh.MaKH
            HAVING totalSpent > 0
            ORDER BY totalSpent DESC
            LIMIT ?
        `, params);
        res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});
