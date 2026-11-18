// Dữ liệu toàn cục
let mockBooks = [];
let categories = [];

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm chính xác hơn
function removeAccents(str) {
    if (!str) return "";
    return str.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

// Hàm loadData (Phiên bản an toàn: Chống lỗi undefined)
async function loadData() {
    try {
        // 1. Lấy Sách từ Server
        const responseBooks = await fetch('/api/books');
        const dataBooks = await responseBooks.json();

        // --- KHỐI XỬ LÝ DỮ LIỆU QUAN TRỌNG ---
        mockBooks = dataBooks.books.map(book => {
            // Tính toán số lượng bán giả lập nếu chưa có
            // (Logic: Bán được gấp 3 đến 10 lần số review)
            const safeReviewCount = Number(book.reviewCount) || 0;
            const calculatedSold = book.soldCount ? Number(book.soldCount) : (safeReviewCount * (Math.floor(Math.random() * 7) + 3));

            return {
                ...book,
                // Ép kiểu dữ liệu để tránh lỗi "toLocaleString"
                // Nếu không có giá trị, mặc định là 0 hoặc rỗng
                id: String(book.id),
                title: book.title || "Sách chưa cập nhật tên",
                author: book.author || "Đang cập nhật",
                price: Number(book.price) || 0,
                originalPrice: Number(book.originalPrice) || 0,
                rating: Number(book.rating) || 5,

                // Đây là 2 dòng sửa lỗi chính của bạn:
                reviewCount: safeReviewCount,
                soldCount: calculatedSold,

                coverImage: book.coverImage || 'https://via.placeholder.com/300x450?text=No+Image',
                description: book.description || "Chưa có mô tả.",

                // Xử lý tags
                tags: book.tags || []
            };
        });
        // ---------------------------------------

        // 2. Lấy Danh mục
        const responseCats = await fetch('/api/categories');
        const dataCats = await responseCats.json();

        categories = dataCats.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            bookCount: cat.bookCount || 0,
            description: cat.description,
            image: cat.image
        }));

        // --- THÊM ĐOẠN NÀY ĐỂ SỬA LỖI GIỎ HÀNG MA ---
        // Lọc lại giỏ hàng: Chỉ giữ lại những món có ID tồn tại trong dữ liệu sách mới
        if (cart && cart.length > 0) {
            const validCart = cart.filter(item => mockBooks.some(b => b.id === item.bookId));

            // Nếu phát hiện có món hàng "ma" (không tồn tại), cập nhật lại giỏ
            if (validCart.length !== cart.length) {
                console.log('Đã dọn dẹp các sản phẩm lỗi trong giỏ hàng');
                cart = validCart;
                saveCart(); // Lưu lại giỏ hàng sạch
                updateCartBadge(); // Cập nhật số trên icon
            }
        }

        console.log(`✅ Đã tải ${mockBooks.length} sách thành công.`);

        // Vẽ lại trang
        renderPage();
        renderCategoryDropdown();

    } catch (error) {
        console.error('Lỗi tải dữ liệu:', error);
        // Vẫn render trang để hiển thị ít nhất là giao diện tĩnh hoặc thông báo lỗi
        renderPage();
    }
}

// ==================== STATE MANAGEMENT ====================
let cart = JSON.parse(localStorage.getItem('bookstoreCart')) || [];

function saveCart() {
    localStorage.setItem('bookstoreCart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'block' : 'none';

        // --- CODE MỚI ĐỂ KÍCH HOẠT HIỆU ỨNG ---
        badge.classList.add('cart-pop'); // Thêm class
        // Xóa class sau khi animation kết thúc để có thể chạy lại
        setTimeout(() => {
            badge.classList.remove('cart-pop');
        }, 300); // 300ms = thời gian của animation
    }
}

// --- HÀM 1: XỬ LÝ KHI BẤM NÚT "ĐẶT HÀNG" ---
function completeOrder() {
    // 1. LẤY DỮ LIỆU TỪ FORM
    const name = document.getElementById('ship-name').value.trim();
    const phone = document.getElementById('ship-phone').value.trim();
    const address = document.getElementById('ship-address').value.trim();

    // 2. VALIDATION (KIỂM TRA TRỐNG)
    if (!name || !phone || !address) {
        showToast('Vui lòng điền đầy đủ Tên, SĐT và Địa chỉ!', 'error');
        return; // Dừng lại ngay, không cho đi tiếp
    }

    // Kiểm tra SĐT sơ sài (đủ 10 số)
    if (phone.length < 10) {
        showToast('Số điện thoại không hợp lệ!', 'error');
        return;
    }

    // 3. LẤY PHƯƠNG THỨC THANH TOÁN
    const paymentMethod = document.querySelector('input[name="payMethod"]:checked').value;

    // 4. XỬ LÝ THEO PHƯƠNG THỨC
    if (paymentMethod === 'cod') {
        // Nếu là COD -> Gửi đơn luôn
        processOrderToBackend(paymentMethod);
    } else if (paymentMethod === 'momo') {
        // Nếu là MoMo -> Gửi đơn lên server trước, sau đó gọi MoMo API
        processOrderToBackend(paymentMethod);
    } else {
        // Nếu là Bank -> Vẫn hiện QR Code tĩnh như cũ (hoặc bạn có thể tích hợp VNPay/VietQR sau)
        showQRPopup(paymentMethod);
    }
}

// --- HÀM 2: HIỆN POPUP THANH TOÁN MINH HỌA ---
function showQRPopup(method) {
    let qrImage = '';
    let bankName = '';

    if (method === 'momo') {
        qrImage = '/ảnh/thanh toán/demo-payment-placeholder.svg';
        bankName = 'Ví điện tử MoMo';
    } else {
        qrImage = '/ảnh/thanh toán/demo-payment-placeholder.svg';
        bankName = 'VietQR / Ngân hàng (demo)';
    }

    // Tạo mã nội dung chuyển khoản ngẫu nhiên để chuyên nghiệp hơn
    const transferCode = `TDS${Date.now().toString().slice(-6)}`;
    const totalAmount = getCartTotal() + (getCartTotal() > 700000 ? 0 : 30000);

    // Tạo HTML cho Popup
    const popupHTML = `
        <div id="payment-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center; backdrop-filter: blur(4px);">
            <div style="background:white; padding:2rem; border-radius:1.5rem; max-width:420px; width:90%; text-align:center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid rgba(255,255,255,0.1); position: relative; animation: modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <button onclick="document.getElementById('payment-overlay').remove()" style="position:absolute; top:1rem; right:1rem; background:none; border:none; cursor:pointer; color:var(--gray-400); padding:0.5rem;" aria-label="Đóng">
                    <svg style="width:24px;height:24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <div style="margin-bottom: 1.5rem;">
                    <h2 style="font-family: var(--font-serif); font-size: 1.5rem; color:var(--gray-900); margin-bottom:0.5rem;">Thanh toán qua ${bankName}</h2>
                    <p style="color:var(--gray-600); font-size:0.95rem;">QR chỉ minh họa giao diện, không quét hoặc chuyển tiền. Kênh ngân hàng chưa kết nối.</p>
                </div>

                <div style="background: #f8fafc; padding: 1rem; border-radius: 1rem; margin-bottom: 1.5rem; display: inline-block;">
                    <img src="${qrImage}" alt="Minh họa QR thanh toán, không dùng để chuyển tiền" style="width:240px; height:240px; object-fit: contain; border-radius: 0.5rem;">
                </div>

                <div style="background:var(--amber-50); padding:1.25rem; border-radius:1rem; margin-bottom:1.5rem; text-align:left; border: 1px solid var(--amber-100);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
                        <span style="color:var(--gray-600);">Số tiền:</span>
                        <span style="color:var(--amber-700); font-weight:bold; font-size:1.1rem;">${formatPrice(totalAmount)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--gray-600);">Nội dung:</span>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="color:blue; font-family:monospace; font-weight:bold; font-size:1.1rem;">${transferCode}</span>
                            <button onclick="navigator.clipboard.writeText('${transferCode}'); showToast('Đã sao chép nội dung', 'success')" style="background:none; border:none; cursor:pointer; color:var(--gray-400);">
                                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div style="display:grid; gap:0.75rem;">
                    <button onclick="confirmPayment('${method}')" class="btn btn-primary" style="justify-content:center; width:100%; padding:1rem;">
                        Tôi đã thanh toán xong
                    </button>
                    <button onclick="document.getElementById('payment-overlay').remove()" class="btn btn-outline" style="justify-content:center; width:100%;">
                        Chọn phương thức khác
                    </button>
                </div>

                <p style="margin-top:1.5rem; font-size:0.8rem; color:var(--gray-500);">
                    Đây là luồng mô phỏng cục bộ; không có giao dịch ngân hàng thật.
                </p>
            </div>
        </div>
        <style>
            @keyframes modalPop {
                0% { opacity: 0; transform: scale(0.9) translateY(20px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
            }
        </style>
    `;

    // Chèn vào body
    document.body.insertAdjacentHTML('beforeend', popupHTML);
}

// --- HÀM 3: XÁC NHẬN ĐÃ THANH TOÁN & GỬI ĐƠN ---
function confirmPayment(method) {
    // Xóa popup
    document.getElementById('payment-overlay').remove();
    // Gửi đơn hàng đi
    processOrderToBackend(method);
}

// --- HÀM 4: GỬI API XUỐNG SERVER (ĐÃ CẬP NHẬT) ---
async function processOrderToBackend(paymentMethod) {
    const userJson = localStorage.getItem('currentUser');
    if (!userJson) {
        showToast('Phiên đăng nhập hết hạn!', 'error');
        return;
    }
    let user = JSON.parse(userJson);

    // 1. Lấy dữ liệu mới nhất từ Form nhập liệu
    const name = document.getElementById('ship-name').value.trim();
    const phone = document.getElementById('ship-phone').value.trim();
    const address = document.getElementById('ship-address').value.trim();
    const note = document.getElementById('ship-note').value.trim();

    // 2. Chuẩn bị dữ liệu sách
    const itemsToSend = cart.map(item => {
        const book = mockBooks.find(b => b.id === item.bookId);
        return {
            bookId: item.bookId,
            quantity: item.quantity,
            price: book ? book.price : 0
        };
    });

    const subtotal = itemsToSend.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalAmount = subtotal + (subtotal > 700000 ? 0 : 30000);

    try {
        showToast('Đang xử lý đơn hàng...', 'info');

        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: user.customerId || user.MaKH || (user.id ? 'KH' + String(user.id).padStart(4, '0') : null),
                cartItems: itemsToSend,
                totalAmount: totalAmount,
                paymentMethod: paymentMethod,
                // Gửi thông tin khách hàng riêng để Server lưu lại
                customerInfo: {
                    name: name,
                    phone: phone,
                    address: address,
                    note: note
                }
            })
        });

        const result = await response.json();

        if (result.success) {
            // --- XỬ LÝ THANH TOÁN ONLINE (MOMO) ---
            if (paymentMethod === 'momo') {
                showToast('Đang chuyển hướng đến MoMo...', 'info');
                try {
                    const momoResponse = await fetch('/api/momo-payment', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            amount: totalAmount,
                            orderId: result.orderId,
                            orderInfo: 'Thanh toán đơn hàng ' + result.orderId + ' tại Thiên Đường Sách'
                        })
                    });
                    const momoData = await momoResponse.json();

                    if (momoData && momoData.payUrl) {
                        // Lưu thông tin để lần sau không phải nhập lại
                        user.name = name;
                        user.phone = phone;
                        user.address = address;
                        localStorage.setItem('currentUser', JSON.stringify(user));

                        // Xóa giỏ hàng trước khi đi
                        cart = [];
                        saveCart();
                        updateCartBadge();

                        // Chuyển hướng
                        window.location.href = momoData.payUrl;
                        return;
                    } else {
                        showToast('Không thể kết nối với MoMo. Vui lòng thử lại!', 'error');
                    }
                } catch (err) {
                    console.error('MoMo Error:', err);
                    showToast('Lỗi khởi tạo thanh toán online', 'error');
                }
            }
            // ------------------------------------

            showToast(`🎉 Đặt hàng thành công! Mã đơn: ${result.orderId}`, 'success');

            // --- CẬP NHẬT LẠI LOCALSTORAGE ĐỂ LẦN SAU KHÔNG PHẢI NHẬP LẠI ---
            user.name = name;
            user.phone = phone;
            user.address = address;
            localStorage.setItem('currentUser', JSON.stringify(user));
            // ------------------------------------------------------------------

            cart = [];
            saveCart();
            updateCartBadge();
            await loadData();
            navigateTo('home');
        } else {
            showToast('Lỗi: ' + result.message, 'error');
        }

    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối server', 'error');
    }
}

function addToCart(bookId, quantity = 1) {
    const book = mockBooks.find(b => b.id === bookId);
    if (!book) return;

    const existingItem = cart.find(item => item.bookId === bookId);
    const currentQuantityInCart = existingItem ? existingItem.quantity : 0;
    const stock = book.stockCount;

    // --- LOGIC MỚI: KIỂM TRA TỒN KHO ---
    if (currentQuantityInCart + quantity > stock) {
        showToast(`Đã đạt số lượng tồn kho tối đa (${stock} cuốn)`, 'error');
        return; // Dừng hàm, không thêm nữa
    }

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({ bookId, quantity });
    }

    saveCart();
    // --- THAY THẾ ALERT BẰNG TOAST ---
    showToast(`Đã thêm "${book.title}" vào giỏ!`, 'success');
}

function removeFromCart(bookId) {
    cart = cart.filter(item => item.bookId !== bookId);
    saveCart();
    renderPage();
}

function updateQuantity(bookId, quantity) {
    const book = mockBooks.find(b => b.id === bookId);
    if (!book) return;

    // --- LOGIC MỚI: KIỂM TRA TỒN KHO KHI TĂNG SỐ LƯỢNG ---
    if (quantity > book.stockCount) {
        showToast(`Chỉ còn ${book.stockCount} cuốn trong kho`, 'error');
        return; // Dừng hàm, không cập nhật
    }

    if (quantity <= 0) {
        removeFromCart(bookId); // Hàm này sẽ tự render lại trang
        return;
    }

    const item = cart.find(item => item.bookId === bookId);
    if (item) {
        item.quantity = quantity;
        saveCart();
        renderPage(); // Tải lại trang giỏ hàng
    }
}

function getCartTotal() {
    return cart.reduce((total, item) => {
        const book = mockBooks.find(b => b.id === item.bookId);
        return total + (book ? book.price * item.quantity : 0);
    }, 0);
}

// --- BẮT ĐẦU CODE MỚI CHO WISHLIST ---
let wishlist = JSON.parse(localStorage.getItem('bookstoreWishlist')) || [];

function saveWishlist() {
    localStorage.setItem('bookstoreWishlist', JSON.stringify(wishlist));
    // (Chúng ta có thể thêm hàm cập nhật icon header ở đây sau)
}

function isBookInWishlist(bookId) {
    return wishlist.includes(bookId);
}

function toggleWishlist(event, bookId) {
    event.stopPropagation(); // Ngăn hành vi bấm vào card
    event.preventDefault(); // Ngăn hành vi mặc định của nút

    const button = event.currentTarget; // Lấy chính nút trái tim đã bấm

    if (isBookInWishlist(bookId)) {
        // Xóa khỏi wishlist
        wishlist = wishlist.filter(id => id !== bookId);
        button.classList.remove('active'); // Xóa class 'active'
        button.setAttribute('aria-label', 'Thêm vào yêu thích');
    } else {
        // Thêm vào wishlist
        wishlist.push(bookId);
        button.classList.add('active'); // Thêm class 'active'
        button.setAttribute('aria-label', 'Xóa khỏi yêu thích');
    }

    saveWishlist();

    // --- THAY THẾ ALERT BẰNG TOAST ---
    if (button.classList.contains('active')) {
        // Thông báo thành công (màu xanh lá)
        showToast('Đã thêm vào Yêu thích!', 'success');
    } else {
        // Thông báo lỗi/thông tin (màu đỏ)
        showToast('Đã xóa khỏi Yêu thích!', 'error');
    }
}
// --- KẾT THÚC CODE MỚI CHO WISHLIST ---

// --- BIẾN MỚI CHO SẮP XẾP VÀ LỌC ---
let currentSortCriteria = 'rating-desc'; // Sắp xếp mặc định
let currentFilters = {
    priceRange: 'all', // 'all', 'under-100', '100-500', 'over-500', 'custom'
    minPrice: null,
    maxPrice: null,
    minRating: 0,
    availability: 'all' // 'all', 'in-stock'
};

// ==================== FILTER & SORT LOGIC ====================

function applyFilters(books) {
    let result = [...books];

    // 1. Lọc theo giá
    if (currentFilters.priceRange !== 'all') {
        if (currentFilters.priceRange === 'under-100') {
            result = result.filter(b => b.price < 100000);
        } else if (currentFilters.priceRange === '100-500') {
            result = result.filter(b => b.price >= 100000 && b.price <= 500000);
        } else if (currentFilters.priceRange === 'over-500') {
            result = result.filter(b => b.price > 500000);
        } else if (currentFilters.priceRange === 'custom') {
            if (currentFilters.minPrice !== null) {
                result = result.filter(b => b.price >= currentFilters.minPrice);
            }
            if (currentFilters.maxPrice !== null) {
                result = result.filter(b => b.price <= currentFilters.maxPrice);
            }
        }
    }

    // 2. Lọc theo đánh giá
    if (currentFilters.minRating > 0) {
        result = result.filter(b => b.rating >= currentFilters.minRating);
    }

    // 3. Lọc theo tình trạng kho
    if (currentFilters.availability === 'in-stock') {
        result = result.filter(b => b.inStock);
    }

    // 4. Áp dụng sắp xếp
    return sortBooks(result, currentSortCriteria);
}

function handleFilterChange(filterType, value) {
    if (filterType === 'priceRange') {
        currentFilters.priceRange = value;
        if (value !== 'custom') {
            currentFilters.minPrice = null;
            currentFilters.maxPrice = null;
        }
    } else if (filterType === 'minRating') {
        currentFilters.minRating = Number(value);
    } else if (filterType === 'availability') {
        currentFilters.availability = value;
    } else if (filterType === 'customPrice') {
        currentFilters.priceRange = 'custom';
        currentFilters.minPrice = value.min !== '' ? Number(value.min) : null;
        currentFilters.maxPrice = value.max !== '' ? Number(value.max) : null;
    }

    renderPage();
}

function resetFilters() {
    currentFilters = {
        priceRange: 'all',
        minPrice: null,
        maxPrice: null,
        minRating: 0,
        availability: 'all'
    };
    renderPage();
}

function removeFilterTag(filterType) {
    if (filterType === 'price') {
        currentFilters.priceRange = 'all';
        currentFilters.minPrice = null;
        currentFilters.maxPrice = null;
    } else if (filterType === 'rating') {
        currentFilters.minRating = 0;
    } else if (filterType === 'availability') {
        currentFilters.availability = 'all';
    }
    renderPage();
}

function renderFilterSidebar() {
    return `
        <aside class="filter-sidebar" id="filterSidebar">
            <div class="filter-section">
                <div class="filter-title">
                    <span>Lọc theo giá</span>
                    ${currentFilters.priceRange !== 'all' ? `<a href="javascript:void(0)" class="filter-reset-link" onclick="removeFilterTag('price')">Xóa</a>` : ''}
                </div>
                <div class="filter-group">
                    <label class="filter-checkbox">
                        <input type="radio" name="price" value="all" ${currentFilters.priceRange === 'all' ? 'checked' : ''} onchange="handleFilterChange('priceRange', 'all')">
                        <span>Tất cả</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="radio" name="price" value="under-100" ${currentFilters.priceRange === 'under-100' ? 'checked' : ''} onchange="handleFilterChange('priceRange', 'under-100')">
                        <span>Dưới 100.000₫</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="radio" name="price" value="100-500" ${currentFilters.priceRange === '100-500' ? 'checked' : ''} onchange="handleFilterChange('priceRange', '100-500')">
                        <span>100.000₫ - 500.000₫</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="radio" name="price" value="over-500" ${currentFilters.priceRange === 'over-500' ? 'checked' : ''} onchange="handleFilterChange('priceRange', 'over-500')">
                        <span>Trên 500.000₫</span>
                    </label>

                    <div class="filter-price-range">
                        <p style="font-size: 0.875rem; color: var(--gray-600); margin: 0.5rem 0 0.25rem;">Tự nhập khoảng giá:</p>
                        <div class="price-inputs">
                            <input type="number" id="minPrice" placeholder="Từ" class="price-input" value="${currentFilters.minPrice || ''}">
                            <span>-</span>
                            <input type="number" id="maxPrice" placeholder="Đến" class="price-input" value="${currentFilters.maxPrice || ''}">
                        </div>
                        <button class="filter-apply-btn" onclick="applyCustomPrice()">Áp dụng</button>
                    </div>
                </div>
            </div>

            <div class="filter-section">
                <div class="filter-title">
                    <span>Đánh giá</span>
                    ${currentFilters.minRating > 0 ? `<a href="javascript:void(0)" class="filter-reset-link" onclick="removeFilterTag('rating')">Xóa</a>` : ''}
                </div>
                <div class="filter-group">
                    ${[4, 3, 2].map(star => `
                        <label class="filter-checkbox">
                            <input type="radio" name="rating" value="${star}" ${currentFilters.minRating === star ? 'checked' : ''} onchange="handleFilterChange('minRating', '${star}')">
                            <div class="rating-stars">
                                ${renderStars(star)}
                                <span style="margin-left: 0.5rem; color: var(--gray-600);">từ ${star} sao</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="filter-section">
                <div class="filter-title">
                    <span>Trạng thái</span>
                </div>
                <div class="filter-group">
                    <label class="filter-checkbox">
                        <input type="radio" name="availability" value="all" ${currentFilters.availability === 'all' ? 'checked' : ''} onchange="handleFilterChange('availability', 'all')">
                        <span>Tất cả</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="radio" name="availability" value="in-stock" ${currentFilters.availability === 'in-stock' ? 'checked' : ''} onchange="handleFilterChange('availability', 'in-stock')">
                        <span>Còn hàng</span>
                    </label>
                </div>
            </div>

            <button class="btn btn-outline" style="width: 100%; margin-top: 1rem; justify-content: center;" onclick="resetFilters()">Đặt lại tất cả</button>
        </aside>
    `;
}

function applyCustomPrice() {
    const min = document.getElementById('minPrice').value;
    const max = document.getElementById('maxPrice').value;
    handleFilterChange('customPrice', { min, max });
}

function toggleMobileFilter() {
    const sidebar = document.getElementById('filterSidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }
}

function renderActiveFilterTags() {
    let tags = [];

    if (currentFilters.priceRange !== 'all') {
        let label = '';
        if (currentFilters.priceRange === 'under-100') label = 'Dưới 100k';
        else if (currentFilters.priceRange === '100-500') label = '100k - 500k';
        else if (currentFilters.priceRange === 'over-500') label = 'Trên 500k';
        else if (currentFilters.priceRange === 'custom') {
            label = `${currentFilters.minPrice ? formatPrice(currentFilters.minPrice) : '0'} - ${currentFilters.maxPrice ? formatPrice(currentFilters.maxPrice) : '...'}`;
        }
        tags.push({ type: 'price', label });
    }

    if (currentFilters.minRating > 0) {
        tags.push({ type: 'rating', label: `${currentFilters.minRating}★ trở lên` });
    }

    if (currentFilters.availability === 'in-stock') {
        tags.push({ type: 'availability', label: 'Còn hàng' });
    }

    if (tags.length === 0) return '';

    return `
        <div class="active-filters">
            ${tags.map(tag => `
                <span class="filter-tag">
                    ${tag.label}
                    <span class="filter-tag-close" onclick="removeFilterTag('${tag.type}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </span>
                </span>
            `).join('')}
            <a href="javascript:void(0)" onclick="resetFilters()" style="font-size: 0.8125rem; color: var(--amber-600); margin-left: 0.5rem; display: flex; align-items: center;">Xóa tất cả</a>
        </div>
    `;
}

// ==================== UTILITY FUNCTIONS ====================
function formatPrice(price) {
    return price.toLocaleString('vi-VN') + '₫';
}

function renderStars(rating) {
    let html = '<div class="stars">';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            html += '<span class="star">★</span>';
        } else {
            html += '<span class="star star-empty">★</span>';
        }
    }
    html += '</div>';
    return html;
}

// --- HÀM MỚI ĐỂ HIỂN THỊ TOAST ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconCheck = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    const iconError = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
        <div class="toast-icon">
            ${type === 'success' ? iconCheck : iconError}
        </div>
        <div class="toast-message">${message}</div>
    `;
    container.appendChild(toast);

    // Bắt đầu hẹn giờ tự động xóa
    setTimeout(() => {
        toast.classList.add('fade-out');
        // Xóa hẳn element sau khi animation kết thúc
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000); // 3 giây
}

// --- BẮT ĐẦU CODE MỚI CHO SẮP XẾP ---

// Hàm render dropdown HTML
function renderSortDropdown() {
    return `
        <div class="sort-container">
            <label for="sort-select">Sắp xếp theo:</label>
            <select id="sort-select" class="sort-select" onchange="handleSortChange(this.value)">
                <option value="rating-desc" ${currentSortCriteria === 'rating-desc' ? 'selected' : ''}>Phổ biến nhất</option>
                <option value="price-asc" ${currentSortCriteria === 'price-asc' ? 'selected' : ''}>Giá: Thấp đến Cao</option>
                <option value="price-desc" ${currentSortCriteria === 'price-desc' ? 'selected' : ''}>Giá: Cao đến Thấp</option>
                <option value="rating-asc" ${currentSortCriteria === 'rating-asc' ? 'selected' : ''}>Đánh giá: Thấp đến Cao</option>
                <option value="title-asc" ${currentSortCriteria === 'title-asc' ? 'selected' : ''}>Tên: A-Z</option>
                <option value="title-desc" ${currentSortCriteria === 'title-desc' ? 'selected' : ''}>Tên: Z-A</option>
            </select>
        </div>
    `;
}

// Hàm sắp xếp sách theo tiêu chí
function sortBooks(books, criteria) {
    const sortedBooks = [...books];

    switch (criteria) {
        case 'price-asc':
            sortedBooks.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            sortedBooks.sort((a, b) => b.price - a.price);
            break;
        case 'rating-asc':
            sortedBooks.sort((a, b) => (a.rating || 0) - (b.rating || 0));
            break;
        case 'rating-desc':
            sortedBooks.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'title-asc':
            sortedBooks.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-desc':
            sortedBooks.sort((a, b) => b.title.localeCompare(a.title));
            break;
        default:
            // Phổ biến nhất (Rating + Review Count)
            sortedBooks.sort((a, b) => {
                const byRating = (b.rating || 0) - (a.rating || 0);
                if (byRating !== 0) return byRating;
                return (b.reviewCount || 0) - (a.reviewCount || 0);
            });
            break;
    }
    return sortedBooks;
}

// --- KẾT THÚC CODE MỚI CHO SẮP XẾP ---

// ==================== RENDER COMPONENTS ====================
function renderBookCard(book) {
    const hasDiscount = book.originalPrice && book.originalPrice > book.price;
    const discountPercent = hasDiscount ? Math.round((1 - book.price / book.originalPrice) * 100) : 0;
    const inWishlist = isBookInWishlist(book.id);
    const lowStock = book.stockCount > 0 && book.stockCount <= 5;

    return `
        <div class="card" onclick="navigateTo('book/${book.id}')">
            <div class="card-image">
                <img src="${book.coverImage}" alt="${book.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x600?text=No+Image'">
                ${hasDiscount ? `<div class="card-badge" style="background: linear-gradient(135deg, #ef4444, #dc2626); font-weight: 700;">-${discountPercent}%</div>` : ''}
                ${lowStock ? `<div class="card-badge" style="background: var(--amber-500); top: auto; bottom: 0.75rem; left: 0.75rem; right: auto; font-size: 0.75rem;">Chỉ còn ${book.stockCount}!</div>` : ''}
                <button
                    class="wishlist-btn ${inWishlist ? 'active' : ''}"
                    onclick="toggleWishlist(event, '${book.id}')"
                    aria-label="${inWishlist ? 'Xóa khỏi yêu thích' : 'Thêm vào yêu thích'}">
                    <svg class="icon" viewBox="0 0 24 24" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <button
                    class="quick-view-btn"
                    onclick="openQuickView(event, '${book.id}')">
                    Xem nhanh
                </button>
            </div>
            <div class="card-content">
                <span class="card-category">${book.category}</span>
                <h3 class="card-title">${book.title}</h3>
                <p class="card-author">${book.author}</p>
                <div class="card-rating">
                    ${renderStars(book.rating)}
                    <span class="rating-text">${book.rating} (${(book.reviewCount || 0).toLocaleString()})</span>
                </div>
                <div class="card-sold">
                    <small>Đã bán: <strong>${(book.soldCount || 0).toLocaleString()}</strong></small>
                </div>

                <div class="card-footer">
                    <div>
                        <span class="card-price">${formatPrice(book.price)}</span>
                        ${hasDiscount ? `<span class="card-price-old">${formatPrice(book.originalPrice)}</span>` : ''}
                    </div>
                </div>

                <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${book.id}')" ${!book.inStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    ${book.inStock ? 'Thêm vào giỏ' : 'Hết hàng'}
                </button>
            </div>
        </div>
    `;
}

// --- BẮT ĐẦU CODE MỚI: LẤP ĐẦY MENU THỂ LOẠI ---
function renderCategoryDropdown() {
    const menuContainer = document.getElementById('categoryDropdownMenu');
    if (!menuContainer) return; // Thoát nếu không tìm thấy

    // Dùng const categories đã có sẵn
    const menuHTML = categories.map(cat => `
        <a href="#category/${cat.id}" class="category-menu-item">
            <span class="category-menu-title">${cat.name}</span>
            <span class="category-menu-count">${cat.bookCount} cuốn sách</span>
        </a>
    `).join('');

    menuContainer.innerHTML = menuHTML;
}
// --- KẾT THÚC CODE MỚI ---

function renderHomePage() {
    const featuredBooks = mockBooks.slice(0, 4);
    const bestsellers = [...mockBooks]
        .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
        .slice(0, 4);

    const totalReviews = mockBooks.reduce((sum, b) => sum + (b.reviewCount || 0), 0);
    const totalRating = mockBooks.reduce((sum, b) => sum + (b.rating || 0), 0);
    const avgRating = mockBooks.length > 0 ? (totalRating / mockBooks.length) : 0;
    const reviewsLabel = `${totalReviews.toLocaleString()} đánh giá`;
    const avgLabel = `Trung bình ${avgRating.toFixed(1)} sao`;

    return `
        <!-- Hero Section Premium -->
        <section class="hero">
            <div class="container">
                <div class="hero-grid">
                    <div class="hero-content" style="position: relative; z-index: 2;">
                        <div class="hero-badge" style="animation: fadeInUp 0.6s ease-out both;">
                            <span style="margin-right: 0.5rem;">✨</span> Bộ sưu tập mới đã có sẵn
                        </div>
                        <h1 class="hero-title" style="animation: fadeInUp 0.6s ease-out 0.1s both;">
                            Khám phá cuốn sách<span class="hero-title-highlight">Tuyệt vời tiếp theo</span>
                        </h1>
                        <p class="hero-description" style="animation: fadeInUp 0.6s ease-out 0.2s both;">
                            Bộ sưu tập được tuyển chọn kỹ lưỡng gồm sách bán chạy, viên ngọc ẩn và những tác phẩm văn học kinh điển.
                        </p>
                        <div class="hero-actions" style="animation: fadeInUp 0.6s ease-out 0.3s both;">
                            <a href="#categories-section" class="btn btn-primary">
                                Khám phá bộ sưu tập
                                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <polyline points="12 5 19 12 12 19"></polyline>
                                </svg>
                            </a>
                            <a href="#category/new-arrivals" class="btn btn-outline">Xem sách mới</a>
                        </div>

                        <!-- Trust Badges -->
                        <div style="display: flex; gap: 2rem; margin-top: 2.5rem; animation: fadeInUp 0.6s ease-out 0.4s both;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-700);">
                                <div style="width: 2rem; height: 2rem; background: var(--green-50); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <svg style="width: 1rem; height: 1rem; color: var(--green-600);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <span>Miễn phí ship</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-700);">
                                <div style="width: 2rem; height: 2rem; background: var(--blue-50); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <svg style="width: 1rem; height: 1rem; color: var(--blue-600);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                                <span>Thanh toán an toàn</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-700);">
                                <div style="width: 2rem; height: 2rem; background: var(--amber-100); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <svg style="width: 1rem; height: 1rem; color: var(--amber-600);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                </div>
                                <span>Đổi trả 7 ngày</span>
                            </div>
                        </div>
                    </div>
                    <div class="hero-image" style="animation: fadeInUp 0.6s ease-out 0.2s both;">
                        <img src="/ảnh/hero-banner.png" alt="Góc đọc sách" style="border-radius: var(--radius-2xl);" onerror="this.src='https://images.unsplash.com/photo-1602990721338-9cbb5b983c4d?w=800'">
                        <div class="hero-stats" style="backdrop-filter: blur(10px); background: rgba(255,255,255,0.9); border-radius: var(--radius-lg);">
                            <div class="hero-stats-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                            </div>
                            <div>
                                <div style="font-weight: 700; color: var(--gray-900);">${reviewsLabel}</div>
                                <div style="font-size: 0.8125rem; color: var(--gray-500);">${avgLabel}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Stats Counter Banner (Static & Redesigned) -->
        <section style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 4rem 1rem; position: relative; overflow: hidden; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);">
            <!-- Subtle Decorative Elements -->
            <div style="position: absolute; top: -100px; left: -100px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(217, 119, 6, 0.05) 0%, transparent 70%); pointer-events: none;"></div>
            <div style="position: absolute; bottom: -100px; right: -100px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(217, 119, 6, 0.05) 0%, transparent 70%); pointer-events: none;"></div>

            <div class="container" style="position: relative; z-index: 1;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 4rem; flex-wrap: wrap;">
                    <!-- Stat 1: Books -->
                    <div style="display: flex; align-items: center; gap: 1.5rem; transition: transform 0.3s ease;" onmouseenter="this.style.transform='translateY(-5px)'" onmouseleave="this.style.transform='translateY(0)'">
                        <div style="width: 4.5rem; height: 4.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);">
                            <svg style="width: 2rem; height: 2rem; color: var(--amber-400);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 3rem; font-weight: 800; color: white; line-height: 1.1; font-family: var(--font-serif);">72+</div>
                            <div style="color: var(--gray-400); font-size: 0.9375rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;">Đầu sách tuyển chọn</div>
                        </div>
                    </div>

                    <!-- Divider for Desktop -->
                    <div style="width: 1px; height: 3rem; background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent); @media (max-width: 768px) { display: none; }"></div>

                    <!-- Stat 2: Categories -->
                    <div style="display: flex; align-items: center; gap: 1.5rem; transition: transform 0.3s ease;" onmouseenter="this.style.transform='translateY(-5px)'" onmouseleave="this.style.transform='translateY(0)'">
                        <div style="width: 4.5rem; height: 4.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);">
                            <svg style="width: 2rem; height: 2rem; color: var(--amber-400);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 3rem; font-weight: 800; color: white; line-height: 1.1; font-family: var(--font-serif);">6</div>
                            <div style="color: var(--gray-400); font-size: 0.9375rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;">Thể loại đa dạng</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        ${renderCategoriesSection()}
        ${renderFeaturedBooks(featuredBooks)}
        ${renderBestsellersSection(bestsellers)}

        <!-- Testimonials Section -->
        <section style="padding: 5rem 1rem; background: linear-gradient(180deg, white, #faf8f5);">
            <div class="container">
                <div class="section-header">
                    <h2 class="section-title">Khách hàng nói gì?</h2>
                    <p class="section-description">Hàng ngàn người đọc tin tưởng chọn Thiên Đường Sách</p>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                    ${[
                        { name: 'Nguyễn Thanh Hà', text: 'Sách đóng gói cẩn thận, giao hàng nhanh. Đã mua hơn 20 cuốn ở đây, rất hài lòng!', stars: 5 },
                        { name: 'Trần Minh Tuấn', text: 'Kho sách phong phú, giá cả hợp lý. Đặc biệt thích tính năng gợi ý sách theo sở thích.', stars: 5 },
                        { name: 'Lê Thị Mai Anh', text: 'Dịch vụ khách hàng tuyệt vời! Đổi trả dễ dàng, nhân viên hỗ trợ nhiệt tình.', stars: 4 }
                    ].map(t => `
                        <div style="background: white; border: 1px solid rgba(0,0,0,0.06); border-radius: var(--radius-xl); padding: 2rem; box-shadow: var(--shadow-sm); transition: all var(--transition-slow);" onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.transform='';this.style.boxShadow='var(--shadow-sm)'">
                            <div style="display: flex; gap: 0.125rem; margin-bottom: 1rem;">
                                ${'<span style="color: var(--amber-400); font-size: 1.125rem;">★</span>'.repeat(t.stars)}
                                ${'<span style="color: var(--gray-300); font-size: 1.125rem;">★</span>'.repeat(5 - t.stars)}
                            </div>
                            <p style="color: var(--gray-700); line-height: 1.7; margin-bottom: 1.5rem; font-size: 0.9375rem;">"${t.text}"</p>
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div style="width: 2.5rem; height: 2.5rem; background: linear-gradient(135deg, var(--amber-200), var(--amber-400)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 0.875rem;">${t.name[0]}</div>
                                <div>
                                    <div style="font-weight: 600; color: var(--gray-900); font-size: 0.9375rem;">${t.name}</div>
                                    <div style="font-size: 0.8125rem; color: var(--gray-500);">Khách hàng thân thiết</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </section>
    `;
}

// Tách các section ra thành hàm riêng để dễ quản lý
function renderCategoriesSection() {
    return `
        <section class="section section-white" id="categories-section">
            <div class="container">
                <div class="section-header">
                    <h2 class="section-title">Duyệt theo danh mục</h2>
                    <p class="section-description">
                        Khám phá các danh mục được tuyển chọn cẩn thận để tìm chính xác những gì bạn đang tìm kiếm
                    </p>
                </div>
                <div class="grid grid-3">
                    ${categories.map(cat => `
                        <div class="card" onclick="navigateTo('category/${cat.id}')">
                            <div class="card-image">
                                <img src="${cat.image}" alt="${cat.name}" style="height: 200px;">
                            </div>
                            <div class="card-content">
                                <h3 class="card-title">${cat.name}</h3>
                                <p class="card-author">${cat.bookCount} cuốn sách</p>
                                <p style="color: var(--gray-600); font-size: 0.875rem;">${cat.description}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </section>
    `;
}

function renderFeaturedBooks(featuredBooks) {
    return `
        <section class="section">
            <div class="container">
                <div class="section-header">
                    <h2 class="section-title">Gợi ý từ biên tập viên</h2>
                    <p class="section-description">
                        Được chọn lọc bởi đội ngũ yêu sách của chúng tôi vì cách kể chuyện xuất sắc và tác động sâu sắc
                    </p>
                </div>
                <div class="grid grid-4">
                    ${featuredBooks.map(book => renderBookCard(book)).join('')}
                </div>
            </div>
        </section>
    `;
}

function renderBestsellersSection(bestsellers) {
    return `
        <section class="section section-white" id="bestsellers-section">
            <div class="container">
                <div class="section-header">
                    <h2 class="section-title">Sách bán chạy</h2>
                    <p class="section-description">Những cuốn sách được cộng đồng khách hàng tin yêu và lựa chọn</p>
                </div>
                <div class="grid grid-4">
                    ${bestsellers.map(book => renderBookCard(book)).join('')}
                </div>
            </div>
        </section>
    `;
}

// --- HÀM RENDER LỊCH SỬ ĐƠN HÀNG (Cập nhật giao diện trống) ---
async function renderOrderHistoryPage() {
    const userJson = localStorage.getItem('currentUser');
    if (!userJson) {
        return `
            <div class="history-page">
                <div class="history-container" style="text-align:center; padding:4rem 2rem;">
                    <h2 style="margin-bottom:1rem;">Vui lòng đăng nhập</h2>
                    <p style="color:var(--gray-600); margin-bottom:2rem;">Bạn cần đăng nhập để xem lịch sử đơn hàng của mình.</p>
                    <a href="#login" class="btn btn-primary">Đăng nhập ngay</a>
                </div>
            </div>`;
    }
    const user = JSON.parse(userJson);

    try {
        // Gọi API lấy đơn hàng thật
        const customerId = user.customerId || user.MaKH || (user.id ? 'KH' + String(user.id).padStart(4, '0') : null);
        const response = await fetch(`/api/orders/${customerId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        const orders = data.orders || [];

        // --- KIỂM TRA NẾU KHÔNG CÓ ĐƠN HÀNG ---
        if (orders.length === 0) {
            return `
                <div class="history-page">
                    <div class="history-container">
                        <h1 class="history-title">Lịch sử đơn hàng</h1>
                        <div class="empty-cart" style="padding: 4rem 1rem;">
                            <svg class="icon" style="width: 80px; height: 80px; color: var(--gray-300); margin-bottom: 1.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M9 17A2 2 0 1 1 9.01 17.01M15 17A2 2 0 1 1 15.01 17.01M19 17H5L3 9H21L19 17Z"></path>
                                <path d="M9 17L9 4L15 4L15 17"></path>
                            </svg>
                            <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--gray-800);">Bạn chưa có đơn hàng nào</h2>
                            <p style="color: var(--gray-600); margin-bottom: 2rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                                Hãy khám phá kho sách khổng lồ của chúng tôi và tìm cho mình những cuốn sách ưng ý nhất nhé!
                            </p>
                            <a href="#home" class="btn btn-primary" style="padding: 0.75rem 2rem;">Khám phá ngay</a>
                        </div>
                    </div>
                </div>
            `;
        }

        // --- NẾU CÓ ĐƠN HÀNG THÌ HIỂN THỊ ---
        return `
            <div class="history-page">
                <div class="history-container">
                    <h1 class="history-title">Lịch sử đơn hàng</h1>
                    <div class="order-list">
                        ${orders.map(order => `
                            <div class="order-item">
                                <div class="order-details">
                                    <p class="order-id">Đơn hàng #${order.id}</p>
                                    <p class="order-date">Ngày đặt: ${order.date}</p>
                                    <p class="order-total">Tổng cộng: <span style="font-weight:700; color:var(--amber-700)">${formatPrice(order.total)}</span></p>
                                </div>
                                <div class="order-status">
                                    <span class="status-badge ${order.statusClass}">${order.status}</span>
                                </div>
                                <div class="order-actions">
                                    <button class="btn btn-outline" onclick="viewOrderDetail('${order.id}')">Xem chi tiết</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error(error);
        return '<div class="container" style="text-align: center; padding: 3rem;">Lỗi tải lịch sử đơn hàng. Vui lòng thử lại sau.</div>';
    }
}

function renderBookPage(bookId) {
    const book = mockBooks.find(b => b.id === bookId);
    if (!book) {
        return '<div class="container" style="padding: 5rem 1rem; text-align: center;"><h1>Không tìm thấy sách</h1></div>';
    }

    const hasDiscount = book.originalPrice && book.originalPrice > book.price;
    const relatedBooks = mockBooks.filter(b => b.id !== book.id && (b.category === book.category || b.author === book.author)).slice(0, 4);

    return `
        <div class="container" style="padding: 2rem 1rem;">
            <button class="back-to-list-btn" onclick="window.history.back()">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Quay lại danh sách
            </button>

            <div style="display: grid; grid-template-columns: 1fr; gap: 3rem; margin-bottom: 4rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem;">
                    <!-- Book Cover -->
                    <div>
                        <div style="position: relative;">
                            <img src="${book.coverImage}" alt="${book.title}" style="width: 100%; max-width: 500px; border-radius: 0.75rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
                            ${hasDiscount ? '<div class="card-badge">Giảm giá</div>' : ''}
                        </div>
                    </div>

                    <!-- Book Details -->
                    <div>
                        <h1 style="font-family: var(--font-serif); font-size: 2.5rem; margin-bottom: 0.5rem;">${book.title}</h1>
                        <p style="font-size: 1.25rem; color: var(--gray-600); margin-bottom: 1rem;">by ${book.author}</p>

                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem;">
                            ${renderStars(book.rating)}
                            <span style="color: var(--gray-600);">${book.rating} (${book.reviewCount.toLocaleString()} đánh giá)</span>
                        </div>

                        <div style="margin-bottom: 2rem;">
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <span style="font-size: 2rem; font-weight: 700;">${formatPrice(book.price)}</span>
                                ${hasDiscount ? `<span style="font-size: 1.25rem; color: var(--gray-500); text-decoration: line-through;">${formatPrice(book.originalPrice)}</span>` : ''}
                            </div>
                            ${hasDiscount ? `<p style="color: var(--green-600); font-weight: 500;">Tiết kiệm ${formatPrice(book.originalPrice - book.price)}</p>` : ''}
                        </div>

                        <div style="margin-bottom: 2rem;">
                            ${book.inStock ? `
                                <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--green-600);">
                                    <div style="width: 0.5rem; height: 0.5rem; background: var(--green-500); border-radius: 50%;"></div>
                                    <span>Còn hàng (${book.stockCount} cuốn có sẵn)</span>
                                </div>
                            ` : `
                                <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--red-500);">
                                    <div style="width: 0.5rem; height: 0.5rem; background: var(--red-500); border-radius: 50%;"></div>
                                    <span>Hết hàng</span>
                                </div>
                            `}
                        </div>

                        <button class="btn btn-primary" style="width: 100%; justify-content: center; font-size: 1.125rem; padding: 1rem;" onclick="addToCart('${book.id}')" ${!book.inStock ? 'disabled' : ''}>
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            </svg>
                            Thêm vào giỏ
                        </button>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--gray-200);">
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600);">
                                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="1" y="3" width="15" height="13"></rect>
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                                    <circle cx="5.5" cy="18.5" r="2.5"></circle>
                                    <circle cx="18.5" cy="18.5" r="2.5"></circle>
                                </svg>
                                Miễn phí vận chuyển
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600);">
                                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                Thanh toán bảo mật
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600);">
                                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                                Giao hàng toàn quốc
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Description -->
            <div style="background: white; border: 1px solid var(--amber-100); border-radius: 0.75rem; padding: 2rem; margin-bottom: 4rem;">
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem;">Mô tả</h3>
                <p style="color: var(--gray-700); line-height: 1.8; margin-bottom: 1.5rem;">${book.description}</p>

                <h4 style="font-weight: 600; margin-bottom: 0.75rem;">Chi tiết sách</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">ISBN:</span>
                        <span style="font-weight: 500;">${book.isbn}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">Số trang:</span>
                        <span style="font-weight: 500;">${book.pages}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">Nhà xuất bản:</span>
                        <span style="font-weight: 500;">${book.publisher}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">Xuất bản:</span>
                        <span style="font-weight: 500;">${book.publishedDate}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">Ngôn ngữ:</span>
                        <span style="font-weight: 500;">${book.language}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                        <span style="color: var(--gray-600);">Danh mục:</span>
                        <span style="font-weight: 500;">${book.category}</span>
                    </div>
                </div>

                <div style="margin-top: 1.5rem;">
                    <h4 style="font-weight: 600; margin-bottom: 0.75rem;">Thẻ</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${(book.tags || []).map(tag => `<span class="card-category" style="background: var(--amber-100); color: var(--amber-800);">${tag}</span>`).join('')}
                    </div>
                </div>
            </div>

            ${relatedBooks.length > 0 ? `
                <div>
                    <h2 style="font-family: var(--font-serif); font-size: 2rem; margin-bottom: 2rem;">Bạn cũng có thể thích</h2>
                    <div class="grid grid-4">
                        ${relatedBooks.map(book => renderBookCard(book)).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderCartPage() {
    if (cart.length === 0) {
        return `
            <div class="empty-cart">
                <svg class="empty-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                <h1 class="empty-cart-title">Giỏ hàng của bạn đang trống</h1>
                <p class="empty-cart-description">
                    Có vẻ như bạn chưa thêm cuốn sách nào vào giỏ hàng.
                    Bắt đầu khám phá để tìm cuốn sách tuyệt vời tiếp theo của bạn!
                </p>
                <a href="#home" class="btn btn-primary">Tiếp tục mua sắm</a>
            </div>
        `;
    }

    const subtotal = getCartTotal();
    const shipping = subtotal > 700000 ? 0 : 30000;
    const total = subtotal + shipping;

    return `
        <div class="cart-container">
            <div class="cart-header">
                <a href="#home" style="display: inline-flex; align-items: center; gap: 0.5rem; color: var(--amber-600); text-decoration: none; margin-bottom: 1rem;">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Tiếp tục mua sắm
                </a>
                <h1 class="cart-title">Giỏ hàng</h1>
                <p style="color: var(--gray-600);">${cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm trong giỏ hàng</p>
            </div>

            <div class="cart-grid">
                <div class="cart-items">
                    ${cart.map(item => {
                        const book = mockBooks.find(b => b.id === item.bookId);
                        if (!book) return '';

                        return `
                            <div class="cart-item">
                                <img src="${book.coverImage}" alt="${book.title}" class="cart-item-image">

                                <div class="cart-item-details">
                                    <div>
                                        <a href="#book/${book.id}" class="cart-item-title">${book.title}</a>
                                        <p style="color: var(--gray-600);">by ${book.author}</p>
                                        <p style="font-size: 0.875rem; color: var(--gray-500);">${book.category}</p>
                                    </div>

                                    <div class="cart-item-info">
                                        <div class="quantity-control">
                                            <span style="font-size: 0.875rem; color: var(--gray-600);">Số lượng:</span>
                                            <button class="quantity-btn" onclick="updateQuantity('${book.id}', ${item.quantity - 1})" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                                            <div class="quantity-value">${item.quantity}</div>
                                            <button class="quantity-btn" onclick="updateQuantity('${book.id}', ${item.quantity + 1})">+</button>
                                        </div>

                                        <div class="cart-item-price-section">
                                            <div class="cart-item-price">
                                                <div class="cart-item-total">${formatPrice(book.price * item.quantity)}</div>
                                                <div class="cart-item-unit">${formatPrice(book.price)} / cuốn</div>
                                            </div>
                                            <button class="remove-btn" onclick="removeFromCart('${book.id}')">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="cart-summary">
                    <h2 class="summary-title">Tóm tắt đơn hàng</h2>

                    <div class="summary-row">
                        <span>Tạm tính (${cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm)</span>
                        <span>${formatPrice(subtotal)}</span>
                    </div>

                    <div class="summary-row">
                        <span>Vận chuyển</span>
                        <span>${shipping === 0 ? 'Miễn phí' : formatPrice(shipping)}</span>
                    </div>

                    ${shipping === 0 ? '<p style="font-size: 0.875rem; color: var(--green-600); margin: 0.5rem 0;">🎉 Bạn được miễn phí vận chuyển!</p>' : `<p style="font-size: 0.875rem; color: var(--gray-600); margin: 0.5rem 0;">Thêm ${formatPrice(700000 - subtotal)} để được miễn phí vận chuyển</p>`}

                    <hr class="summary-divider">

                    <div class="summary-total">
                        <span>Tổng cộng</span>
                        <span>${formatPrice(total)}</span>
                    </div>

                    <div class="summary-actions">
                        <button class="btn btn-primary" style="width: 100%; justify-content: center;" onclick="showPaymentPage()">
                            Tiến hành thanh toán
                        </button>
                        <a href="#home" class="btn btn-outline" style="width: 100%; justify-content: center; text-decoration: none;">
                            Tiếp tục mua sắm
                        </a>
                    </div>

                    <div style="padding-top: 1rem; border-top: 1px solid var(--gray-200); margin-top: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.5rem;">
                            <div style="width: 0.5rem; height: 0.5rem; background: var(--green-500); border-radius: 50%;"></div>
                            <span>Thanh toán bảo mật</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.5rem;">
                            <div style="width: 0.5rem; height: 0.5rem; background: var(--green-500); border-radius: 50%;"></div>
                            <span>Hỗ trợ khách hàng 24/7</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--gray-600);">
                            <div style="width: 0.5rem; height: 0.5rem; background: var(--green-500); border-radius: 50%;"></div>
                            <span>Vận chuyển nhanh & đáng tin cậy</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- HÀM HIỂN THỊ TRANG THANH TOÁN (GIAO DIỆN MỚI) ---
function showPaymentPage() {
    if (!cart || cart.length === 0) {
        showToast('Giỏ hàng trống. Không thể tiến hành thanh toán.', 'error');
        navigateTo('cart');
        return;
    }

    // Tính toán tiền
    const subtotal = getCartTotal();
    const shipping = subtotal > 700000 ? 0 : 30000;
    const total = subtotal + shipping;

    // Lấy thông tin user để điền sẵn
    const userJson = localStorage.getItem('currentUser');
    const user = userJson ? JSON.parse(userJson) : { name: '', email: '', phone: '', address: '' };

    const app = document.getElementById('app');

    // HTML Giao diện mới
    app.innerHTML = `
        <section class="section" style="padding-top: 2rem; background-color: #f8f9fa;">
            <div class="container">
                <div style="margin-bottom: 1.5rem;">
                    <a href="#cart" style="text-decoration: none; color: var(--gray-600); display: inline-flex; align-items: center; gap: 0.5rem;">
                        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Quay lại giỏ hàng
                    </a>
                    <h1 style="font-family: var(--font-serif); font-size: 2rem; margin-top: 0.5rem;">Thanh toán</h1>
                </div>

                <div class="payment-wrapper">
                    <div class="payment-left">
                        <h3 class="payment-section-title">📍 Thông tin giao hàng</h3>
                        <div class="address-form-grid">
                            <div class="full-width">
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500;">Họ và tên <span style="color:red">*</span></label>
                                <input type="text" id="ship-name" class="payment-input" value="${user.name}" placeholder="Nguyễn Văn A">
                            </div>
                            <div>
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500;">Số điện thoại <span style="color:red">*</span></label>
                                <input type="tel" id="ship-phone" class="payment-input" value="${user.phone || ''}" placeholder="09xx...">
                            </div>
                            <div>
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500;">Email</label>
                                <input type="email" id="ship-email" class="payment-input" value="${user.email || ''}" placeholder="email@example.com">
                            </div>
                            <div class="full-width">
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500;">Địa chỉ nhận hàng <span style="color:red">*</span></label>
                                <input type="text" id="ship-address" class="payment-input" value="${user.address || ''}" placeholder="Số nhà, tên đường, phường/xã...">
                            </div>
                            <div class="full-width">
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500;">Ghi chú (Tùy chọn)</label>
                                <textarea id="ship-note" class="payment-input" rows="2" placeholder="Ví dụ: Giao giờ hành chính..."></textarea>
                            </div>
                        </div>

                        <h3 class="payment-section-title" style="margin-top: 2rem;">💳 Phương thức thanh toán</h3>
                        <div class="payment-methods-grid">
                            <div class="method-option">
                                <input type="radio" name="payMethod" value="cod" checked>
                                <div class="method-label">
                                    <svg class="method-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                                    <div>
                                        <div style="font-weight:600;">Thanh toán khi nhận hàng (COD)</div>
                                        <div style="font-size:0.85rem; color:var(--gray-500);">Bạn chỉ phải thanh toán khi đã nhận được sách</div>
                                    </div>
                                </div>
                            </div>

                            <div class="method-option">
                                <input type="radio" name="payMethod" value="bank">
                                <div class="method-label">
                                    <svg class="method-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V7l8-4 8 4v14M10 9a2 2 0 1 1 4 0"></path></svg>
                                    <div>
                                        <div style="font-weight:600;">Chuyển khoản Ngân hàng (QR Code)</div>
                                        <div style="font-size:0.85rem; color:var(--gray-500);">Quét mã VietQR chuyển khoản nhanh 24/7</div>
                                    </div>
                                </div>
                            </div>

                            <div class="method-option">
                                <input type="radio" name="payMethod" value="momo">
                                <div class="method-label">
                                    <svg class="method-icon" style="color:#d82d8b" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path></svg>
                                    <div>
                                        <div style="font-weight:600;">Ví điện tử Momo</div>
                                        <div style="font-size:0.85rem; color:var(--gray-500);">Thanh toán siêu tốc qua ứng dụng Momo</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="payment-right">
                        <h3 class="payment-section-title">Đơn hàng (${cart.reduce((s, i) => s + i.quantity, 0)} sản phẩm)</h3>

                        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 1.5rem;">
                            ${cart.map(item => {
                                const book = mockBooks.find(b => b.id === item.bookId) || {};
                                return `
                                    <div class="order-summary-item">
                                        <img src="${book.coverImage}" class="order-summary-img" onerror="this.src='https://via.placeholder.com/50x75'">
                                        <div style="flex:1;">
                                            <div style="font-weight:500; font-size:0.9rem; margin-bottom:0.25rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${book.title}</div>
                                            <div style="font-size:0.85rem; color:var(--gray-500);">SL: ${item.quantity} x ${formatPrice(book.price)}</div>
                                        </div>
                                        <div style="font-weight:600; font-size:0.95rem;">${formatPrice(book.price * item.quantity)}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <div class="summary-row">
                            <span>Tạm tính</span>
                            <span>${formatPrice(subtotal)}</span>
                        </div>
                        <div class="summary-row">
                            <span>Phí vận chuyển</span>
                            <span>${shipping === 0 ? 'Miễn phí' : formatPrice(shipping)}</span>
                        </div>

                        <div class="total-row">
                            <span>Tổng cộng</span>
                            <span>${formatPrice(total)}</span>
                        </div>

                        <button onclick="completeOrder()" class="payment-btn">
                            ĐẶT HÀNG NGAY
                        </button>

                        <div style="text-align:center; margin-top:1rem; font-size:0.8rem; color:var(--gray-500);">
                            <p>Bằng việc đặt hàng, bạn đồng ý với <a href="#">Điều khoản dịch vụ</a> của chúng tôi.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;

    window.scrollTo(0, 0);
}
// 2. SỬA HÀM renderCategoryPage (Logic lọc mới - Đã fix lỗi so sánh ID)
function renderCategoryPage(categoryId) {
    let baseBooks = [];
    let pageTitle = '';

    // Kiểm tra các trang đặc biệt
    if (categoryId === 'bestsellers') {
        baseBooks = [...mockBooks].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 12);
        pageTitle = 'Sách bán chạy';
    } else if (categoryId === 'new-arrivals') {
        baseBooks = mockBooks.slice(-12);
        pageTitle = 'Sách mới';
    } else {
        const category = categories.find(cat => cat.id == categoryId);

        if (category) {
            baseBooks = mockBooks.filter(book => book.categoryId == categoryId);
            pageTitle = category.name;
        } else {
            const catByName = categories.find(cat =>
                cat.name.toLowerCase() === categoryId.replace(/-/g, ' ').toLowerCase()
            );
            if (catByName) {
                baseBooks = mockBooks.filter(book => book.categoryId == catByName.id);
                pageTitle = catByName.name;
            } else {
                pageTitle = 'Danh mục không tồn tại';
            }
        }
    }

    // Áp dụng bộ lọc và sắp xếp
    const filteredBooks = applyFilters(baseBooks);

    return `
        <div class="container" style="padding: 2rem 1rem;">
            <a href="#home" class="back-to-list-btn">← Về trang chủ</a>

            <div style="margin-bottom: 2rem;">
                <h1 style="font-family: var(--font-serif); font-size: 2.5rem;">${pageTitle}</h1>
            </div>

            <div class="page-layout">
                ${renderFilterSidebar()}

                <main class="results-container">
                    <button class="mobile-filter-toggle" onclick="toggleMobileFilter()">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                        Bộ lọc
                    </button>

                    <div class="results-header">
                        <p style="color: var(--gray-600);">${filteredBooks.length} cuốn sách</p>
                        ${renderSortDropdown()}
                    </div>

                    ${renderActiveFilterTags()}

                    ${filteredBooks.length > 0 ? `
                        <div class="grid grid-3">
                            ${filteredBooks.map(book => renderBookCard(book)).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding:5rem 2rem; background:white; border-radius:var(--radius-xl); border:1px dashed var(--gray-300);">
                            <svg class="icon" style="width:4rem; height:4rem; color:var(--gray-300); margin-bottom:1.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <h3>Không tìm thấy sách phù hợp</h3>
                            <p style="color:var(--gray-500); margin-top:0.5rem;">Thử thay đổi bộ lọc hoặc xóa bớt tiêu chí để có thêm kết quả.</p>
                            <button class="btn btn-primary" style="margin-top:1.5rem;" onclick="resetFilters()">Xóa tất cả bộ lọc</button>
                        </div>
                    `}
                </main>
            </div>
        </div>
    `;
}

// --- BẮT ĐẦU CODE MỚI CHO TRANG TÌM KIẾM ---
function renderSearchResultsPage(query) {
    const decodedQuery = decodeURIComponent(query);
    const queryLower = decodedQuery.toLowerCase();
    const queryNoAccent = removeAccents(decodedQuery);

    // Lọc mảng mockBooks theo từ khóa (Không phân biệt dấu)
    const baseBooks = mockBooks.filter(book => {
        const title = book.title.toLowerCase();
        const author = book.author.toLowerCase();
        const isbn = (book.isbn || '').toLowerCase();

        const titleNoAccent = removeAccents(title);
        const authorNoAccent = removeAccents(author);

        return title.includes(queryLower) ||
               author.includes(queryLower) ||
               isbn.includes(queryLower) ||
               titleNoAccent.includes(queryNoAccent) ||
               authorNoAccent.includes(queryNoAccent);
    });

    // Sắp xếp ưu tiên kết quả tìm kiếm
    baseBooks.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aTitleNoAccent = removeAccents(aTitle);
        const bTitleNoAccent = removeAccents(bTitle);

        const aStart = aTitle.startsWith(queryLower) ? 0 : (aTitleNoAccent.startsWith(queryNoAccent) ? 1 : 2);
        const bStart = bTitle.startsWith(queryLower) ? 0 : (bTitleNoAccent.startsWith(queryNoAccent) ? 1 : 2);

        if (aStart !== bStart) return aStart - bStart;
        return aTitle.length - bTitle.length;
    });

    // Áp dụng bộ lọc và sắp xếp nâng cao (giá, đánh giá...)
    const filteredBooks = applyFilters(baseBooks);

    return `
        <div class="search-results-page">
            <div class="container" style="padding: 2rem 1rem;">
                <a href="#home" class="search-back-link">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Về trang chủ
                </a>

                <div style="margin-bottom: 2rem;">
                    <h1 style="font-family: var(--font-serif); font-size: 2.5rem; margin-bottom: 0.5rem;">Kết quả cho: "${decodedQuery}"</h1>
                </div>

                <div class="page-layout">
                    ${renderFilterSidebar()}

                    <main class="results-container">
                        <button class="mobile-filter-toggle" onclick="toggleMobileFilter()">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                            Bộ lọc
                        </button>

                        <div class="results-header">
                            <p style="color: var(--gray-600);">${filteredBooks.length} cuốn sách được tìm thấy</p>
                            ${renderSortDropdown()}
                        </div>

                        ${renderActiveFilterTags()}

                        ${filteredBooks.length > 0 ? `
                            <div class="grid grid-3">
                                ${filteredBooks.map(book => renderBookCard(book)).join('')}
                            </div>
                        ` : `
                            <div style="text-align:center; padding:5rem 2rem; background:white; border-radius:var(--radius-xl); border:1px dashed var(--gray-300);">
                                <svg class="icon" style="width:4rem; height:4rem; color:var(--gray-300); margin-bottom:1.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="m21 21-4.35-4.35"></path>
                                </svg>
                                <h3>Không tìm thấy kết quả phù hợp</h3>
                                <p style="color:var(--gray-500); margin-top:0.5rem;">Thử tìm kiếm với từ khóa khác hoặc điều chỉnh bộ lọc.</p>
                                <button class="btn btn-primary" style="margin-top:1.5rem;" onclick="resetFilters()">Xóa tất cả bộ lọc</button>
                            </div>
                        `}
                    </main>
                </div>
            </div>
        </div>
    `;
}
// --- KẾT THÚC CODE MỚI CHO TRANG TÌM KIẾM ---

// --- BẮT ĐẦU CODE MỚI CHO TRANG YÊU THÍCH ---
function renderWishlistPage() {
    // Lấy thông tin đầy đủ của sách từ mảng wishlist (chỉ chứa ID)
    const wishlistBooks = wishlist.map(bookId => {
        return mockBooks.find(book => book.id === bookId);
    }).filter(book => book); // Lọc ra những sách không còn tồn tại (nếu có)

    return `
        <div class="wishlist-page">
            <div class="container">
                <a href="#home" class="wishlist-back-link">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Tiếp tục mua sắm
                </a>

                <div class="wishlist-header">
                    <h1 class="wishlist-title">Danh sách Yêu thích</h1>
                    <p class="wishlist-count">Bạn có ${wishlistBooks.length} cuốn sách trong danh sách.</p>
                </div>

                ${wishlistBooks.length > 0 ? `
                    <div class="grid grid-4">
                        ${wishlistBooks.map(book => renderBookCard(book)).join('')}
                    </div>
                ` : `
                    <p class="wishlist-empty">Danh sách yêu thích của bạn đang trống.</p>
                `}
            </div>
        </div>
    `;
}
// --- KẾT THÚC CODE MỚI CHO TRANG YÊU THÍCH ---

// ==================== ROUTING ====================
function navigateTo(path) {
    window.location.hash = path;
}

// --- HÀM RENDERPAGE (PHIÊN BẢN NÂNG CẤP: HỖ TRỢ ASYNC/AWAIT) ---
function renderPage() {
    const app = document.getElementById('app');
    const hash = window.location.hash.slice(1) || 'home';

    // Chuyển loadContent thành async để chờ dữ liệu
    async function loadContent(hash) {
        let contentHTML = '';
        let shouldScrollToTop = true;
        let scrollToElement = null;

        // --- CÁC TRANG CẦN CHỜ DỮ LIỆU (ASYNC) ---
        if (hash === 'orders') {
            // Thêm await để chờ API trả về kết quả
            contentHTML = await renderOrderHistoryPage();
        }
        // --- CÁC TRANG TĨNH (SYNC) ---
        else if (hash === 'home' || hash === '') {
            contentHTML = renderHomePage();
        } else if (hash.startsWith('book/')) {
            const bookId = hash.split('/')[1];
            contentHTML = renderBookPage(bookId);
        } else if (hash === 'login') {
            window.location.href = 'login.html';
            return;
        } else if (hash === 'register') {
            window.location.href = 'login.html#register';
            return;
        } else if (hash === 'cart') {
            contentHTML = renderCartPage();
        } else if (hash.startsWith('search/')) {
            const query = hash.split('/')[1];
            contentHTML = renderSearchResultsPage(query);
        } else if (hash.startsWith('category/')) {
            const categoryId = hash.split('/')[1];
            contentHTML = renderCategoryPage(categoryId);
        } else if (hash === 'wishlist') {
            contentHTML = renderWishlistPage();
        } else if (hash === 'contact') {
            contentHTML = renderContactPage();
        } else if (hash === 'shipping-info') {
            contentHTML = renderShippingInfoPage();
        } else if (hash === 'forgot-password') {
            contentHTML = renderForgotPasswordPage();
        } else if (hash === 'faq') {
            contentHTML = renderFAQPage();
        } else if (hash === 'privacy') {
            contentHTML = renderPrivacyPage();
        } else if (hash === 'terms') {
            contentHTML = renderTermsPage();
        } else if (hash === 'categories-section') {
            shouldScrollToTop = false;
            scrollToElement = 'categories-section';
        } else if (hash === 'bestsellers-section') {
            shouldScrollToTop = false;
            scrollToElement = 'bestsellers-section';
        } else {
            contentHTML = renderHomePage();
        }

        return { contentHTML, shouldScrollToTop, scrollToElement };
    }

    // Hàm xử lý cuộn trang
    function handleScrolling(shouldScrollToTop, elementId) {
        if (shouldScrollToTop) {
            window.scrollTo(0, 0);
            return;
        }
        if (elementId) {
            if (!document.getElementById(elementId)) {
                app.innerHTML = renderHomePage();
            }
            setTimeout(() => {
                const element = document.getElementById(elementId);
                if (element) element.scrollIntoView({ behavior: 'smooth' });
            }, 0);
        }
    }

    // --- LOGIC FADE-OUT / FADE-IN (Đã sửa để hỗ trợ async) ---
    app.classList.add('fade-out');

    setTimeout(async () => { // Thêm async vào đây
        try {
            // Thêm await vào đây để chờ nội dung được tải xong
            const { contentHTML, shouldScrollToTop, scrollToElement } = await loadContent(hash);

            if (contentHTML) {
                app.innerHTML = contentHTML;
            }

            handleScrolling(shouldScrollToTop, scrollToElement);

            app.classList.remove('fade-out');
            app.classList.add('fade-in');

            setTimeout(() => {
                app.classList.remove('fade-in');
            }, 500);
        } catch (error) {
            console.error("Lỗi render trang:", error);
            app.innerHTML = '<div class="container" style="padding:3rem; text-align:center">Đã có lỗi xảy ra. Vui lòng tải lại trang.</div>';
            app.classList.remove('fade-out');
        }

    }, 300);
}

// ==================== EVENT HANDLERS ====================
function handleSearch(event) {
    event.preventDefault();
    const query = document.getElementById('searchInput').value.trim();

    // Ẩn dropdown autocomplete
    closeSearchAutocomplete();

    if (query) {
        // Điều hướng đến một trang kết quả tìm kiếm
        navigateTo('search/' + encodeURIComponent(query));

        // Tùy chọn: Xóa nội dung trong ô tìm kiếm sau khi gửi
        // document.getElementById('searchInput').value = '';
    }
}

// --- AUTOCOMPLETE TÌM KIẾM ---
let autocompleteActiveIndex = -1; // Track keyboard navigation

function handleSearchAutocomplete(value) {
    const dropdown = document.getElementById('searchAutocomplete');
    if (!dropdown) return;

    const query = value.trim();
    autocompleteActiveIndex = -1;

    // Nếu ô trống, ẩn dropdown
    if (!query || query.length === 0) {
        closeSearchAutocomplete();
        return;
    }

    const queryLower = query.toLowerCase();
    const queryNoAccent = removeAccents(query);

    // Tìm kiếm sách theo tên, tác giả, ISBN (Không phân biệt dấu)
    const matchedBooks = mockBooks.filter(book => {
        const title = book.title.toLowerCase();
        const author = book.author.toLowerCase();
        const isbn = (book.isbn || '').toLowerCase();

        const titleNoAccent = removeAccents(title);
        const authorNoAccent = removeAccents(author);

        return title.includes(queryLower) ||
               author.includes(queryLower) ||
               isbn.includes(queryLower) ||
               titleNoAccent.includes(queryNoAccent) ||
               authorNoAccent.includes(queryNoAccent);
    });

    // Sắp xếp ưu tiên:
    // 1. Tên bắt đầu bằng từ khóa (có dấu)
    // 2. Tên bắt đầu bằng từ khóa (không dấu)
    // 3. Tác giả bắt đầu bằng từ khóa
    // 4. Tên chứa từ khóa
    matchedBooks.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aTitleNoAccent = removeAccents(aTitle);
        const bTitleNoAccent = removeAccents(bTitle);

        const aStart = aTitle.startsWith(queryLower) ? 0 : (aTitleNoAccent.startsWith(queryNoAccent) ? 1 : 2);
        const bStart = bTitle.startsWith(queryLower) ? 0 : (bTitleNoAccent.startsWith(queryNoAccent) ? 1 : 2);

        if (aStart !== bStart) return aStart - bStart;

        // Nếu cùng mức độ ưu tiên, sắp xếp theo độ dài (ngắn hơn lên trước)
        return aTitle.length - bTitle.length;
    });

    // Nếu không có kết quả
    if (matchedBooks.length === 0) {
        dropdown.innerHTML = `
            <div class="search-autocomplete-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <div>Không tìm thấy sách phù hợp</div>
            </div>
        `;
        dropdown.classList.add('active');
        return;
    }

    // Lấy tối đa 3 kết quả để hiển thị preview
    const previewBooks = matchedBooks.slice(0, 3);
    const totalResults = matchedBooks.length;

    // Hàm highlight từ khóa trong text (Không phân biệt dấu)
    function highlightMatch(text, query) {
        if (!text || !query) return text || '';

        const textNoAccent = removeAccents(text);
        const queryNoAccent = removeAccents(query);

        let result = "";
        let lastIndex = 0;
        let searchIndex = textNoAccent.indexOf(queryNoAccent, lastIndex);

        if (searchIndex === -1) {
            // Fallback: Thử highlight bình thường nếu không tìm thấy bằng removeAccents
            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }

        while (searchIndex !== -1) {
            result += text.substring(lastIndex, searchIndex);
            // Lấy đoạn text gốc tương ứng với độ dài của query (giả định độ dài không đổi đáng kể)
            // Trong hầu hết trường hợp NFC, độ dài text gốc và textNoAccent là khớp nhau
            result += `<mark>${text.substring(searchIndex, searchIndex + query.length)}</mark>`;
            lastIndex = searchIndex + query.length;
            searchIndex = textNoAccent.indexOf(queryNoAccent, lastIndex);
        }
        result += text.substring(lastIndex);
        return result;
    }

    let html = `<div class="search-autocomplete-header">Gợi ý tìm kiếm (${totalResults} kết quả)</div>`;

    previewBooks.forEach((book, index) => {
        html += `
            <div class="search-autocomplete-item"
                 onclick="navigateToBookFromSearch('${book.id}')"
                 data-index="${index}">
                <img class="search-autocomplete-item-img"
                     src="${book.coverImage}"
                     alt="${book.title}"
                     onerror="this.src='https://via.placeholder.com/44x60?text=No+Image'" />
                <div class="search-autocomplete-item-info">
                    <div class="search-autocomplete-item-title">${highlightMatch(book.title, query)}</div>
                    <div class="search-autocomplete-item-author">${book.author}</div>
                </div>
                <div class="search-autocomplete-item-price">${formatPrice(book.price)}</div>
            </div>
        `;
    });

    // Nút "Xem thêm" nếu có nhiều hơn 3 kết quả
    if (totalResults > 3) {
        html += `
            <div class="search-autocomplete-more" onclick="searchAndNavigate('${query.replace(/'/g, "\\'")}')">
                Xem tất cả ${totalResults} kết quả
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </div>
        `;
    } else {
        // Nếu chỉ có <= 3 kết quả, vẫn cho xem trang kết quả đầy đủ
        html += `
            <div class="search-autocomplete-more" onclick="searchAndNavigate('${query.replace(/'/g, "\\'")}')">
                Xem trang kết quả đầy đủ
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </div>
        `;
    }

    dropdown.innerHTML = html;
    dropdown.classList.add('active');
}

function navigateToBookFromSearch(bookId) {
    closeSearchAutocomplete();
    navigateTo('book/' + bookId);
}

function searchAndNavigate(query) {
    closeSearchAutocomplete();
    document.getElementById('searchInput').value = query;
    navigateTo('search/' + encodeURIComponent(query));
}

function closeSearchAutocomplete() {
    const dropdown = document.getElementById('searchAutocomplete');
    if (dropdown) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
    }
    autocompleteActiveIndex = -1;
}

// Đóng autocomplete khi click ra ngoài
document.addEventListener('click', function(e) {
    const searchBox = document.querySelector('.search-box');
    if (searchBox && !searchBox.contains(e.target)) {
        closeSearchAutocomplete();
    }
});

// Hỗ trợ điều hướng bằng bàn phím (mũi tên lên/xuống, Enter)
document.addEventListener('keydown', function(e) {
    const dropdown = document.getElementById('searchAutocomplete');
    if (!dropdown || !dropdown.classList.contains('active')) return;

    const items = dropdown.querySelectorAll('.search-autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteActiveIndex = Math.min(autocompleteActiveIndex + 1, items.length - 1);
        updateAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteActiveIndex = Math.max(autocompleteActiveIndex - 1, -1);
        updateAutocompleteHighlight(items);
    } else if (e.key === 'Enter' && autocompleteActiveIndex >= 0) {
        e.preventDefault();
        items[autocompleteActiveIndex].click();
    } else if (e.key === 'Escape') {
        closeSearchAutocomplete();
        document.getElementById('searchInput').blur();
    }
});

function updateAutocompleteHighlight(items) {
    items.forEach((item, i) => {
        if (i === autocompleteActiveIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

// --- HÀM MỚI XỬ LÝ THAY ĐỔI SẮP XẾP ---
function handleSortChange(criteria) {
    currentSortCriteria = criteria; // Cập nhật biến toàn cục
    renderPage(); // Vẽ lại trang hiện tại với sắp xếp mới
}

// ... (code hàm handleSortChange) ...

// --- BẮT ĐẦU CODE MỚI CHO MODAL XEM NHANH ---
function openQuickView(event, bookId) {
    event.stopPropagation(); // Ngăn bấm vào card
    event.preventDefault(); // Ngăn hành vi của nút

    const book = mockBooks.find(b => b.id === bookId);
    if (!book) return;

    const modalOverlay = document.getElementById('quick-view-modal');
    const modalWrapper = modalOverlay.querySelector('.modal-content-wrapper');

    const hasDiscount = book.originalPrice && book.originalPrice > book.price;

    // 1. Tạo HTML cho nội dung modal
    modalWrapper.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="closeQuickView()">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="quick-view-grid">
                <div class="quick-view-image">
                    <img src="${book.coverImage}" alt="${book.title}">
                </div>
                <div class="quick-view-details">
                    <h1 class="quick-view-title">${book.title}</h1>
                    <p class="quick-view-author">by ${book.author}</p>

                    <div class="card-rating" style="margin-bottom: 1rem;">
                        ${renderStars(book.rating)}
                        <span class="rating-text">${book.rating} (${book.reviewCount.toLocaleString()})</span>
                    </div>

                    <div>
                        <span class="quick-view-price">${formatPrice(book.price)}</span>
                        ${hasDiscount ? `<span class="card-price-old" style="font-size: 1.25rem;">${formatPrice(book.originalPrice)}</span>` : ''}
                    </div>

                    <p class="quick-view-description">${book.description}</p>

                    <button class="btn btn-primary" style="width: 100%; justify-content: center; font-size: 1.125rem;" onclick="addToCartAndCloseModal('${book.id}')" ${!book.inStock ? 'disabled' : ''}>
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                        ${book.inStock ? 'Thêm vào giỏ' : 'Hết hàng'}
                    </button>

                    <a href="#book/${book.id}" class="quick-view-link" onclick="closeQuickView()">Xem chi tiết sản phẩm →</a>
                </div>
            </div>
        </div>
    `;

    // 2. Thêm event listener để đóng modal khi bấm vào nền mờ
    modalOverlay.addEventListener('click', closeQuickViewOnOverlayClick);

    // 3. Hiển thị modal
    modalOverlay.classList.add('show');
}

function closeQuickView() {
    const modalOverlay = document.getElementById('quick-view-modal');
    modalOverlay.classList.remove('show');

    // Xóa event listener để tránh lỗi
    modalOverlay.removeEventListener('click', closeQuickViewOnOverlayClick);

    // Xóa nội dung để dọn dẹp
    const modalWrapper = modalOverlay.querySelector('.modal-content-wrapper');
    modalWrapper.innerHTML = '';
}

// Hàm tiện ích để chỉ đóng khi bấm vào nền mờ, không phải nội dung
function closeQuickViewOnOverlayClick(event) {
    if (event.target === event.currentTarget) {
        closeQuickView();
    }
}

// Hàm tiện ích mới để vừa thêm giỏ hàng vừa đóng modal
function addToCartAndCloseModal(bookId) {
    addToCart(bookId); // Dùng lại hàm thêm giỏ hàng đã có
    closeQuickView(); // Đóng modal
}
// --- KẾT THÚC CODE MỚI CHO MODAL XEM NHANH ---

function handleNewsletter(event) {
    event.preventDefault();
    alert('Cảm ơn bạn đã đăng ký! (Chức năng này đang được phát triển)');
    event.target.reset();
}

// --- XỬ LÝ ĐĂNG KÝ (GỌI API) ---
async function handleRegister(event) {
    event.preventDefault();

    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showToast('Mật khẩu xác nhận không khớp!', 'error');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Đăng ký thành công! Hãy đăng nhập.', 'success');
            navigateTo('login'); // Chuyển sang trang đăng nhập
        } else {
            showToast(data.message || 'Đăng ký thất bại', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối tới server', 'error');
    }
}

// --- XỬ LÝ ĐĂNG NHẬP (JWT Token) ---
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');

    // Disable button trong khi xử lý
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang xử lý...'; }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            // Lưu JWT Token và thông tin user
            if (data.token) localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));

            showToast('Xin chào, ' + data.user.name + '! 🎉', 'success');

            // --- REDIRECTION BASED ON ROLE ---
            if (data.user.role === 'ADMIN') {
                setTimeout(() => window.location.href = '/admin.html', 1000);
            } else if (data.user.role === 'SHIPPER') {
                setTimeout(() => window.location.href = '/shipper.html', 1000);
            } else {
                checkLoginStatus();
                navigateTo('home');
            }
        } else {
            showToast(data.message || 'Đăng nhập thất bại', 'error');
            // Nếu sai pass/user, có thể redirect sang trang login thật
            setTimeout(() => window.location.href = 'login.html', 1500);
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối tới server', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Đăng nhập'; }
    }
}

// --- HÀM KIỂM TRA ĐĂNG NHẬP (CẬP NHẬT HEADER) ---
async function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    const accountBtnText = document.querySelector('.header-btn-text');
    const dropdown = document.getElementById('accountDropdown');

    if (!token) return;

    try {
        const res = await fetch('/api/verify-token', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();

        if (data.success && data.user) {
            // Cập nhật lại localStorage với thông tin chính xác từ Server
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            const user = data.user;

            if (accountBtnText) accountBtnText.textContent = user.name;

            if (dropdown) {
                const isAdmin = user.role === 'ADMIN';
                const isStaff = user.role === 'STAFF';
                let adminLink = '';
                if (isAdmin) adminLink = '<a href="/admin.html" style="color: var(--amber-600); font-weight:600;">⚙️ Quản trị</a>';
                else if (isStaff) adminLink = '<a href="/staff.html" style="color: var(--amber-600); font-weight:600;">👥 Nhân viên</a>';

                dropdown.innerHTML = `
                    <div style="padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);">
                        <div style="font-weight:600; color:var(--gray-900)">${user.name}</div>
                        <div style="font-size:0.8rem; color:var(--gray-500)">${user.email || ''}</div>
                    </div>
                    <a href="#orders">📦 Lịch sử đơn hàng</a>
                    <a href="#wishlist">❤️ Yêu thích</a>
                    ${adminLink}
                    <a href="#" onclick="handleLogout()" style="color: var(--red-500);">🚪 Đăng xuất</a>
                `;
            }
        } else {
            // Token hết hạn hoặc không hợp lệ
            handleLogout(false); // Đăng xuất im lặng
        }
    } catch (e) {
        console.warn('Lỗi mạng khi verify-token, dùng localStorage dự phòng');
        // Fallback: dùng localStorage
        const userJson = localStorage.getItem('currentUser');
        if (userJson && accountBtnText && dropdown) {
            const user = JSON.parse(userJson);
            accountBtnText.textContent = user.name;
        }
    }
}

// --- HÀM ĐĂNG XUẤT ---
function handleLogout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    showToast('Đã đăng xuất thành công!', 'success');
    window.location.reload();
}

// Helper: Lấy auth headers cho API calls
function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Hàm load stats real-time từ DB đã được gỡ bỏ vì không còn sử dụng

// ==================== INITIALIZATION ====================

window.addEventListener('hashchange', renderPage);
window.addEventListener('load', async () => {
    await loadData();
    checkLoginStatus();

    // --- KIỂM TRA TRẠNG THÁI THANH TOÁN TỪ URL ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('status')) {
        const status = urlParams.get('status');
        if (status === 'success') {
            showToast('Thanh toán đơn hàng thành công! 🎉', 'success');
        } else if (status === 'failed') {
            showToast('Thanh toán không thành công hoặc đã bị hủy.', 'error');
        }
        // Xóa tham số khỏi URL để tránh lặp lại toast khi reload
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
    // ------------------------------------------

    // Sau khi có dữ liệu (mockBooks, categories), mới chạy các hàm render
    updateCartBadge();
    renderPage();
    renderCategoryDropdown();
    // loadSiteStats() đã bị gỡ bỏ
    // --- BẮT ĐẦU CODE MỚI CHO DROPDOWN ---
    const accountBtn = document.getElementById('accountBtn');
    const accountDropdown = document.getElementById('accountDropdown');

    if (accountBtn && accountDropdown) {
        // 1. Mở/Đóng menu khi bấm vào nút "Tài khoản"
        accountBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Ngăn sự kiện click lan ra ngoài
            accountDropdown.classList.toggle('show');
        });

        // 2. Đóng menu khi bấm vào một link trong menu
        accountDropdown.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                accountDropdown.classList.remove('show');
            });
        });
    }

    // 3. Đóng menu khi bấm ra bất kỳ đâu bên ngoài
    window.addEventListener('click', (event) => {
        if (accountBtn && accountDropdown && accountDropdown.classList.contains('show')) {
            // Kiểm tra xem có bấm vào nút "Tài khoản" hoặc menu không
            if (!accountBtn.contains(event.target) && !accountDropdown.contains(event.target)) {
                accountDropdown.classList.remove('show');
            }
        }
    });
    // --- KẾT THÚC CODE MỚI CHO DROPDOWN ---
    // --- BẠN DÁN CODE MỚI VÀO ĐÂY ---
    const menuToggle = document.querySelector(".mobile-menu-toggle");
    const menuClose = document.querySelector(".mobile-menu-close-btn");
    const menuOverlay = document.querySelector(".mobile-menu-overlay");
    const mainNav = document.getElementById("main-nav"); // Lấy nav bằng ID
    const navDropdowns = document.querySelectorAll(".nav-dropdown");

    // Hàm mở menu
    const openMenu = () => {
        document.body.classList.add("mobile-menu-is-open");
    };

    // Hàm đóng menu
    const closeMenu = () => {
        document.body.classList.remove("mobile-menu-is-open");
    };

    // Sự kiện click
    if (menuToggle) {
        menuToggle.addEventListener("click", openMenu);
    }
    if (menuClose) {
        menuClose.addEventListener("click", closeMenu);
    }
    if (menuOverlay) {
        menuOverlay.addEventListener("click", closeMenu);
    }

    // Đóng menu khi bấm vào link trong nav (trên mobile)
    if (mainNav) {
        mainNav.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    closeMenu();
                }
            });
        });
    }

    // Xử lý click dropdown "Thể loại" trên mobile
    navDropdowns.forEach(dropdown => {
        const link = dropdown.querySelector(".nav-link-dropdown");

        if (link) { // Thêm kiểm tra
            link.addEventListener("click", (event) => {
                // Chỉ xử lý khi ở màn hình mobile
                if (window.innerWidth <= 768) {
                    event.preventDefault(); // Ngăn chuyển trang
                    dropdown.classList.toggle("is-open");
                }
            });
        }
    });
    // --- KẾT THÚC DÁN CODE MỚI ---
});


// --- TRANG LIÊN HỆ ---
function renderContactPage() {
    return `
        <div class="container contact-page">
            <div class="page-header">
                <h1 class="page-title">Liên hệ</h1>
                <p class="page-description">Chúng tôi luôn sẵn sàng hỗ trợ bạn. Chọn kênh phù hợp hoặc điền thông tin bên dưới để nhận phản hồi nhanh nhất.</p>
            </div>

            <div class="contact-grid">
                <!-- LEFT: Contact form -->
                <div class="contact-card">
                    <h2 style="font-size: 1.25rem; margin-bottom: 0.75rem; color: var(--gray-900);">Gửi tin nhắn cho chúng tôi</h2>
                    <p style="color: var(--gray-600); margin-bottom: 1rem;">Mô tả ngắn gọn vấn đề của bạn. Nhóm hỗ trợ sẽ phản hồi trong vòng 24 giờ làm việc (thường sớm hơn).</p>

                    <form class="contact-form" onsubmit="handleContactSubmit(event)">
                        <div class="form-group-inline">
                            <div class="form-group">
                                <label for="ctName">Họ và tên</label>
                                <input type="text" id="ctName" class="form-control" required placeholder="Nguyễn Văn A">
                            </div>
                            <div class="form-group">
                                <label for="ctEmail">Email</label>
                                <input type="email" id="ctEmail" class="form-control" required placeholder="email@vd.com">
                            </div>
                        </div>

                        <div class="form-group-inline" style="margin-bottom: 0.75rem;">
                            <div class="form-group">
                                <label for="ctPhone">Số điện thoại (tùy chọn)</label>
                                <input type="tel" id="ctPhone" class="form-control" placeholder="0123 456 789">
                            </div>
                            <div class="form-group">
                                <label for="ctTopic">Chủ đề</label>
                                <select id="ctTopic" class="form-control">
                                    <option value="order">Đơn hàng</option>
                                    <option value="shipping">Vận chuyển</option>
                                    <option value="payment">Thanh toán</option>
                                    <option value="product">Sản phẩm & Sách</option>
                                    <option value="feedback">Phản hồi & Đề xuất</option>
                                    <option value="other">Khác</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="ctMessage">Nội dung</label>
                            <textarea id="ctMessage" class="form-control" rows="6" placeholder="Hãy mô tả chi tiết vấn đề hoặc câu hỏi của bạn..." required></textarea>
                        </div>

                        <div style="display:flex; gap:1rem; align-items:center; margin-top:1rem;">
                            <button type="submit" class="btn btn-primary" style="flex:1;">Gửi liên hệ</button>
                            <button type="button" class="btn btn-outline" onclick="(function(){document.getElementById('ctName').value=''; document.getElementById('ctEmail').value=''; document.getElementById('ctPhone').value=''; document.getElementById('ctMessage').value='';})();">Xóa</button>
                        </div>
                    </form>

                    <div style="margin-top:1.25rem; font-size:0.95rem; color:var(--gray-600);">
                        <strong>Thời gian phản hồi:</strong> thường <em>trong 24 giờ làm việc</em>.<br>
                        <strong>Khẩn cấp:</strong> Gọi hotline <a href="tel:0999123456" style="color:var(--amber-600); text-decoration:underline;">0999 123 456</a> để hỗ trợ nhanh.
                    </div>
                </div>

                <!-- RIGHT: Quick info & hours -->
                <aside class="contact-sidebar">
                    <div class="info-block">
                        <h3>📞 Thông tin liên hệ</h3>
                        <ul class="info-list" style="margin-top:0.5rem;">
                            <li><strong>Hotline:</strong> <a href="tel:0999123456" style="color:var(--amber-600);">0999 123 456</a></li>
                            <li><strong>Email:</strong> <a href="mailto:manhb891@gmail.com" style="color:var(--amber-600);">manhb891@gmail.com</a></li>
                            <li><strong>Địa chỉ:</strong> 123 Phố Sách, Quận Hoàn Kiếm, Hà Nội</li>
                        </ul>
                    </div>

                    <div class="info-block">
                        <h3>⏰ Giờ làm việc</h3>
                        <ul class="info-list" style="margin-top:0.5rem;">
                            <li><strong>Thứ 2 – Thứ 6:</strong> 08:00 – 20:00</li>
                            <li><strong>Thứ 7:</strong> 09:00 – 18:00</li>
                            <li><strong>Chủ nhật & Ngày lễ:</strong> Nghỉ</li>
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    `;
}

function handleContactSubmit(event) {
    event.preventDefault();
    alert('Cảm ơn bạn! Chúng tôi đã nhận được liên hệ và sẽ phản hồi trong thời gian sớm nhất.');
    event.target.reset();
}


// --- TRANG THÔNG TIN GIAO HÀNG ---
function renderShippingInfoPage() {
    return `
        <div class="container shipping-page">
            <div class="page-header">
                <h1 class="page-title">Thông tin giao hàng</h1>
                <p class="page-description">Quy trình xử lý & thời gian vận chuyển được tối ưu để bạn nhận sách nhanh nhất.</p>
            </div>

            <div class="grid grid-2 shipping-grid" style="margin-bottom: 3rem;">
                <div class="shipping-card">
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--gray-900);">📦 Thời gian xử lý</h2>
                    <ul class="bulleted">
                        <li>Đơn hàng xác nhận <strong>trước 16:00</strong> được xử lý trong ngày.</li>
                        <li>Đơn sau <strong>16:00</strong> sẽ xử lý vào ngày làm việc tiếp theo.</li>
                        <li>Không xử lý vào <strong>Chủ nhật</strong> và <strong>ngày lễ</strong>.</li>
                        <li>Thời gian xử lý: <strong>1-2 giờ</strong> sau khi xác nhận.</li>
                    </ul>
                </div>

                <div class="shipping-card">
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--gray-900);">🚚 Thời gian vận chuyển</h2>
                    <ul class="bulleted">
                        <li><strong>Nội thành Hà Nội & TP.HCM:</strong> 1–2 ngày làm việc</li>
                        <li><strong>Các tỉnh kế cận:</strong> 2–3 ngày làm việc</li>
                        <li><strong>Tuyến tỉnh khác:</strong> 3–4 ngày làm việc</li>
                        <li><strong>Vùng xa/đảo:</strong> 5–7 ngày làm việc</li>
                    </ul>
                </div>

                <div class="shipping-card">
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--gray-900);">💰 Phí vận chuyển</h2>
                    <ul class="bulleted">
                        <li>✅ <strong>Miễn phí vận chuyển</strong> cho đơn hàng từ <strong>700.000₫</strong></li>
                        <li>📌 Đơn dưới 700.000₫: phí <strong>30.000₫</strong></li>
                        <li>🎁 Khách hàng thân thiết nhận ưu đãi vận chuyển riêng</li>
                        <li>💳 Không phí ẩn, giá hiển thị trong giỏ hàng</li>
                    </ul>
                </div>

                <div class="shipping-card">
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--gray-900);">ℹ️ Lưu ý quan trọng</h2>
                    <ul class="bulleted">
                        <li>🌍 Giao hàng <strong>toàn quốc</strong> qua đối tác uy tín (GHN, Giao Hàng Tiết Kiệm)</li>
                        <li>✉️ Bạn sẽ nhận <strong>email & SMS</strong> cập nhật từng bước</li>
                        <li>🔍 Theo dõi đơn hàng tại mục <strong>Lịch sử đơn hàng</strong></li>
                        <li>🆘 Liên hệ <a href="#contact" style="color: var(--amber-600); text-decoration: underline;">trang Liên hệ</a> nếu cần hỗ trợ</li>
                    </ul>
                </div>
            </div>

            <!-- Bảng chi tiết -->
            <div style="background: white; padding: 2rem; border-radius: 0.75rem; border: 1px solid var(--amber-100);">
                <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; color: var(--gray-900);">📋 Bảng tóm tắt thời gian giao hàng</h2>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: var(--amber-50); border-bottom: 2px solid var(--amber-200);">
                                <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--gray-900);">Khu vực</th>
                                <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--gray-900);">Thời gian xử lý</th>
                                <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--gray-900);">Thời gian vận chuyển</th>
                                <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--gray-900);">Tổng cộng</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid var(--gray-200);">
                                <td style="padding: 1rem;">Nội thành HN/TP.HCM</td>
                                <td style="padding: 1rem;">1-2 giờ</td>
                                <td style="padding: 1rem;">1-2 ngày</td>
                                <td style="padding: 1rem;"><strong>1-2 ngày</strong></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--gray-200);">
                                <td style="padding: 1rem;">Tỉnh kế cận</td>
                                <td style="padding: 1rem;">1-2 giờ</td>
                                <td style="padding: 1rem;">2-3 ngày</td>
                                <td style="padding: 1rem;"><strong>2-3 ngày</strong></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--gray-200);">
                                <td style="padding: 1rem;">Các tỉnh khác</td>
                                <td style="padding: 1rem;">1-2 giờ</td>
                                <td style="padding: 1rem;">3-4 ngày</td>
                                <td style="padding: 1rem;"><strong>3-5 ngày</strong></td>
                            </tr>
                            <tr>
                                <td style="padding: 1rem;">Vùng xa/đảo</td>
                                <td style="padding: 1rem;">1-2 giờ</td>
                                <td style="padding: 1rem;">5-7 ngày</td>
                                <td style="padding: 1rem;"><strong>5-7 ngày</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--gray-600);">
                    <em>* Thời gian tính từ khi đơn được xác nhận, không tính Chủ nhật và ngày lễ</em>
                </p>
            </div>
        </div>
    `;
}


// --- TRANG CÂU HỎI THƯỜNG GẶP (FAQ) ---
function renderFAQPage() {
    const faqs = [
        {
            q: 'Làm sao để theo dõi đơn hàng?',
            a: 'Bạn vào mục <strong>Lịch sử đơn hàng</strong> và nhập mã đơn hàng (ví dụ: TDS88125) để xem trạng thái chi tiết. Chúng tôi cũng gửi email & SMS khi đơn chuyển trạng thái. Bạn có thể liên hệ hotline 1-800-SACH-99 để được hỗ trợ trực tiếp.'
        },
        {
            q: 'Thời gian giao hàng mất bao lâu?',
            a: '<strong>Nội thành (HN/TP.HCM):</strong> 1–2 ngày<br><strong>Tỉnh kế cận:</strong> 2–3 ngày<br><strong>Tuyến tỉnh khác:</strong> 3–4 ngày<br><strong>Vùng xa/đảo:</strong> 5–7 ngày làm việc<br><br>Xem chi tiết ở trang <a href="#shipping-info" style="color: var(--amber-600); text-decoration: underline;">Thông tin giao hàng</a>.'
        },
        {
            q: 'Phí vận chuyển được tính thế nào?',
            a: '<strong>Đơn từ 700.000₫:</strong> Miễn phí vận chuyển<br><strong>Đơn dưới 700.000₫:</strong> Phí 30.000₫/đơn<br><br>Phí vận chuyển không thay đổi tùy vào khu vực. Nếu bạn là khách hàng thân thiết, bạn sẽ nhận được chiết khấu vận chuyển riêng.'
        },
        {
            q: 'Có thể đổi địa chỉ sau khi đặt hàng không?',
            a: '<strong>Trong 1 giờ</strong> sau khi đặt, bạn có thể liên hệ CSKH qua email (hello@thienduongsach.vn) hoặc hotline (1-800-SACH-99) để cập nhật địa chỉ.<br><br>Sau thời gian này, chúng tôi sẽ cố gắng hỗ trợ ở mức tốt nhất có thể. Nếu sách đã giao, bạn có thể liên hệ để sắp xếp chuyển tiếp.'
        },
        {
            q: 'Những phương thức thanh toán nào được hỗ trợ?',
            a: 'Chúng tôi hỗ trợ nhiều phương thức thanh toán an toàn:<br><strong>• COD (Ghi nợ khi nhận hàng)</strong> - Không cần thanh toán trước<br><strong>• Thẻ ngân hàng nội địa/quốc tế</strong> - Visa, Mastercard, JCB<br><strong>• Ví điện tử</strong> - Momo, ZaloPay, ViettelPay<br><strong>• Chuyển khoản ngân hàng</strong> - Thanh toán trực tiếp vào tài khoản<br><br>Tất cả thanh toán đều được bảo mật 100% với công nghệ mã hóa SSL.'
        },
        {
            q: 'Sách bị hỏng/lỗi thì có đổi được không?',
            a: 'Có, chúng tôi cam kết chất lượng sách. Nếu sách đến tay bạn bị hỏng, nham nhở hoặc lỗi in ấn, bạn có thể:<br><strong>1.</strong> Chụp ảnh chứng minh<br><strong>2.</strong> Gửi email kèm ảnh đến hello@thienduongsach.vn hoặc gọi 1-800-SACH-99<br><strong>3.</strong> Chúng tôi sẽ gửi sách thay thế miễn phí<br><br>Yêu cầu phải được nêu trong vòng <strong>3 ngày sau khi nhận hàng</strong>.'
        },
        {
            q: 'Tôi muốn hoàn lại/hủy đơn hàng được không?',
            a: '<strong>Hủy đơn:</strong> Bạn có thể hủy trong vòng <strong>1 giờ</strong> sau đặt hàng. Hãy liên hệ ngay qua hotline hoặc email.<br><br><strong>Hoàn hàng:</strong> Trong vòng <strong>7 ngày</strong> kể từ khi nhận, nếu sách chưa sử dụng, bạn có thể yêu cầu hoàn lại (trừ phí vận chuyển). Sách phải ở trạng thái nguyên bản.<br><br>Liên hệ CSKH để được hướng dẫn chi tiết.'
        },
        {
            q: 'Làm sao để nhận được thông báo sách mới?',
            a: 'Bạn có thể:<br><strong>1.</strong> Đăng ký nhận bản tin qua email ở <strong>footer của trang</strong><br><strong>2.</strong> Theo dõi trang <a href="#category/new-arrivals" style="color: var(--amber-600); text-decoration: underline;">Sách mới</a> để cập nhật mới nhất<br><strong>3.</strong> Liên hệ để được thêm vào danh sách ưu tiên<br><br>Chúng tôi cập nhật sách mới mỗi tuần!'
        }
    ];

    return `
        <div class="container faq-page">
            <div class="page-header">
                <h1 class="page-title">Câu hỏi thường gặp</h1>
                <p class="page-description">Nhấn vào mũi tên hoặc câu hỏi để xem câu trả lời chi tiết.</p>
            </div>

            <div class="faq-list">
                ${faqs.map((item, idx) => `
                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(${idx})" aria-expanded="false">
                            <span style="flex: 1; text-align: left; font-weight: 500; color: var(--gray-900);">${item.q}</span>
                            <svg class="faq-arrow" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style="flex-shrink: 0;">
                                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clip-rule="evenodd" />
                            </svg>
                        </button>
                        <div class="faq-answer" id="faq-${idx}" style="display: none;">
                            <p>${item.a}</p>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="faq-help">
                <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--gray-900);">Không tìm thấy câu trả lời?</h3>
                <p>Hãy liên hệ với chúng tôi qua các kênh sau:</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <a href="#contact" class="btn btn-primary" style="justify-content: center;">📧 Gửi email liên hệ</a>
                    <a href="tel:1-800-SACH-99" class="btn btn-outline" style="justify-content: center;">📞 Gọi hotline</a>
                </div>
            </div>
        </div>
    `;
}

function toggleFAQ(index) {
    const content = document.getElementById('faq-' + index);
    const btns = document.getElementsByClassName('faq-question');

    if (!content || !btns[index]) return;

    // Đóng tất cả FAQ khác
    for (let i = 0; i < btns.length; i++) {
        if (i !== index) {
            const otherContent = document.getElementById('faq-' + i);
            if (otherContent) {
                otherContent.style.display = 'none';
                btns[i].setAttribute('aria-expanded', 'false');
            }
        }
    }

    // Toggle FAQ hiện tại
    const isExpanded = btns[index].getAttribute('aria-expanded') === 'true';
    btns[index].setAttribute('aria-expanded', (!isExpanded).toString());

    if (isExpanded) {
        content.style.display = 'none';
    } else {
        content.style.display = 'block';
    }
}

// --- TRANG KIỂM TRA ROUTING (EMBEDDED TEST) ---
function renderTestRoutesPage() {
    return `
        <div class="container" style="padding:2rem 1rem;">
            <div style="background:white;border-radius:0.75rem;padding:1.5rem;box-shadow:0 6px 18px rgba(0,0,0,0.06);">
                <h1 style="margin-bottom:0.5rem;">🧪 Test Routing</h1>
                <p style="color:var(--gray-600);margin-bottom:1rem;">Giao diện kiểm tra các tuyến (embedded). Dùng để xác nhận hash routes hoạt động.</p>

                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    <a href="#home" style="padding:0.6rem 0.75rem;border:1px solid var(--gray-200);border-radius:6px;text-decoration:none;color:var(--amber-700);">Trang chủ <small style="color:var(--gray-500); margin-left:0.5rem;">#home</small></a>
                    <a href="#contact" style="padding:0.6rem 0.75rem;border:1px solid var(--gray-200);border-radius:6px;text-decoration:none;color:var(--amber-700);">Liên hệ <small style="color:var(--gray-500); margin-left:0.5rem;">#contact</small></a>
                    <a href="#shipping-info" style="padding:0.6rem 0.75rem;border:1px solid var(--gray-200);border-radius:6px;text-decoration:none;color:var(--amber-700);">Thông tin giao hàng <small style="color:var(--gray-500); margin-left:0.5rem;">#shipping-info</small></a>
                    <a href="#faq" style="padding:0.6rem 0.75rem;border:1px solid var(--gray-200);border-radius:6px;text-decoration:none;color:var(--amber-700);">Câu hỏi thường gặp <small style="color:var(--gray-500); margin-left:0.5rem;">#faq</small></a>
                    <a href="#cart" style="padding:0.6rem 0.75rem;border:1px solid var(--gray-200);border-radius:6px;text-decoration:none;color:var(--amber-700);">Giỏ hàng <small style="color:var(--gray-500); margin-left:0.5rem;">#cart</small></a>
                </div>

                <div style="margin-top:1rem;color:var(--gray-600);font-size:0.95rem;">
                    <ol style="padding-left:1.25rem;">
                        <li>Mở Developer Tools (F12) → Console.</li>
                        <li>Bấm các liên kết ở trên, bạn sẽ thấy các log routing xuất hiện (ví dụ: <code>🔄 Routing to: contact</code> và <code>✅ Rendering contact page</code>).</li>
                        <li>Nếu có lỗi, copy console và gửi cho người hỗ trợ.</li>
                    </ol>
                </div>
            </div>
        </div>
    `;
}

// --- CHÍNH SÁCH BẢO MẬT ---
function renderPrivacyPage() {
    return `
        <div class="container" style="padding:3rem 1rem;">
            <div style="background:white;padding:2rem;border-radius:0.75rem;border:1px solid var(--amber-100);">
                <h1 style="font-family:var(--font-serif);font-size:2rem;margin-bottom:1rem;">Chính sách Bảo mật</h1>
                <p style="color:var(--gray-700);">Chúng tôi tôn trọng quyền riêng tư của bạn. Nội dung chính sách dưới đây mô tả cách chúng tôi thu thập, sử dụng và bảo vệ thông tin của bạn khi bạn sử dụng trang Thiên Đường Sách.</p>

                <h3 style="margin-top:1.25rem;">1. Thông tin chúng tôi thu thập</h3>
                <ul>
                    <li>Thông tin bạn cung cấp trực tiếp: email, tên, địa chỉ giao hàng, thông tin liên hệ khi đặt hàng hoặc đăng ký.</li>
                    <li>Thông tin kỹ thuật: địa chỉ IP, cookie, dữ liệu trình duyệt và hành vi khi tương tác với trang.</li>
                </ul>

                <h3 style="margin-top:1rem;">2. Mục đích sử dụng</h3>
                <ul>
                    <li>Xử lý đơn hàng, giao hàng và liên hệ hỗ trợ khách hàng.</li>
                    <li>Cải thiện trải nghiệm người dùng, phân tích &amp; cá nhân hoá nội dung.</li>
                    <li>Gửi thông báo, khuyến mãi nếu bạn đồng ý nhận tin.</li>
                </ul>

                <h3 style="margin-top:1rem;">3. Chia sẻ thông tin</h3>
                <p style="color:var(--gray-700);">Chúng tôi không bán dữ liệu cá nhân. Thông tin có thể được chia sẻ với đối tác vận chuyển, cổng thanh toán hoặc các nhà cung cấp dịch vụ cần thiết để xử lý đơn hàng — tất cả theo hợp đồng bảo mật.</p>

                <h3 style="margin-top:1rem;">4. Bảo mật dữ liệu</h3>
                <p style="color:var(--gray-700);">Chúng tôi sử dụng các biện pháp kỹ thuật và quy trình hợp lý để bảo vệ dữ liệu. Tuy nhiên, không có phương thức truyền tải dữ liệu trên Internet nào hoàn toàn an toàn; nếu phát hiện rủi ro, chúng tôi sẽ thông báo kịp thời.</p>

                <h3 style="margin-top:1rem;">5. Quyền của bạn</h3>
                <ul>
                    <li>Yêu cầu truy cập, sửa hoặc xoá thông tin cá nhân.</li>
                    <li>Từ chối tiếp thị hoặc rút lại sự đồng ý nhận bản tin.</li>
                </ul>

                <p style="margin-top:1rem;color:var(--gray-600);font-size:0.95rem;">Nếu bạn có câu hỏi về chính sách bảo mật, vui lòng liên hệ: <a href="mailto:hello@thienduongsach.vn" style="color:var(--amber-600);">hello@thienduongsach.vn</a>.</p>
            </div>
        </div>
    `;
}

// --- ĐIỀU KHOẢN DỊCH VỤ ---
function renderTermsPage() {
    return `
        <div class="container" style="padding:3rem 1rem;">
            <div style="background:white;padding:2rem;border-radius:0.75rem;border:1px solid var(--amber-100);">
                <h1 style="font-family:var(--font-serif);font-size:2rem;margin-bottom:1rem;">Điều khoản Dịch vụ</h1>
                <p style="color:var(--gray-700);">Các điều khoản này mô tả quyền hạn, trách nhiệm và cam kết khi bạn sử dụng dịch vụ trên Thiên Đường Sách.</p>

                <h3 style="margin-top:1.25rem;">1. Phạm vi dịch vụ</h3>
                <p style="color:var(--gray-700);">Chúng tôi cung cấp nền tảng mua bán sách trực tuyến, bao gồm hiển thị sản phẩm, xử lý đơn hàng, thanh toán và giao hàng.</p>

                <h3 style="margin-top:1rem;">2. Đặt hàng &amp; Thanh toán</h3>
                <p style="color:var(--gray-700);">Khi đặt hàng, bạn đồng ý cung cấp thông tin chính xác. Thanh toán sẽ tuân theo quy định của cổng thanh toán và chính sách hoàn/huỷ của chúng tôi.</p>

                <h3 style="margin-top:1rem;">3. Hủy/Hoàn trả</h3>
                <p style="color:var(--gray-700);">Chính sách hủy/hoàn trả được mô tả chi tiết trong trang hướng dẫn vận chuyển và hỗ trợ khách hàng. Vui lòng liên hệ để biết chi tiết.</p>

                <h3 style="margin-top:1rem;">4. Trách nhiệm</h3>
                <p style="color:var(--gray-700);">Chúng tôi cố gắng đảm bảo thông tin sản phẩm chính xác, nhưng không chịu trách nhiệm cho sai sót do nhà cung cấp. Trách nhiệm của chúng tôi giới hạn trong phạm vi pháp luật cho phép.</p>

                <h3 style="margin-top:1rem;">5. Thay đổi điều khoản</h3>
                <p style="color:var(--gray-700);">Chúng tôi có thể cập nhật điều khoản theo thời gian; các thay đổi sẽ được thông báo trên trang web.</p>

                <p style="margin-top:1rem;color:var(--gray-600);font-size:0.95rem;">Cần hỗ trợ thêm? Liên hệ: <a href="mailto:hello@thienduongsach.vn" style="color:var(--amber-600);">hello@thienduongsach.vn</a>.</p>
            </div>
        </div>
    `;
}

// --- HÀM XEM CHI TIẾT ĐƠN HÀNG (PHIÊN BẢN SHOPEE/TIKI) ---
async function viewOrderDetail(orderId) {
    try {
        const response = await fetch(`/api/orders/detail/${orderId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        const { info, items } = data;

        // 1. Xử lý Timeline (Tiến trình đơn hàng)
        let steps = [
            { status: 'Chờ xử lý', label: 'Đặt hàng', active: false },
            { status: 'Đang giao', label: 'Vận chuyển', active: false },
            { status: 'Đã giao', label: 'Giao thành công', active: false }
        ];

        // Logic xác định bước hiện tại
        let isCancelled = (info.status === 'Đã hủy');
        let activeIndex = -1;

        if (!isCancelled) {
            if (info.status === 'Chờ xử lý') activeIndex = 0;
            else if (info.status === 'Đang giao') activeIndex = 1;
            else if (info.status === 'Đã giao') activeIndex = 2;

            // Đánh dấu các bước đã qua là active
            steps = steps.map((s, index) => ({
                ...s,
                active: index <= activeIndex
            }));
        }

        // HTML cho Timeline
        let timelineHTML = '';
        if (isCancelled) {
            timelineHTML = `
                <div class="order-timeline" style="justify-content: center;">
                    <div class="timeline-step cancelled">
                        <div class="timeline-icon">✕</div>
                        <div class="timeline-label">Đơn hàng đã hủy</div>
                    </div>
                </div>
            `;
        } else {
            timelineHTML = `
                <div class="order-timeline">
                    ${steps.map((s, i) => `
                        <div class="timeline-step ${s.active ? 'active' : ''}">
                            <div class="timeline-icon">${i + 1}</div>
                            <div class="timeline-label">${s.label}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 2. HTML cho danh sách sản phẩm
        const itemsHTML = items.map(item => `
            <div class="order-detail-item">
                <img src="${item.coverImage}" class="order-detail-img">
                <div class="order-detail-info">
                    <div class="order-detail-title">${item.title}</div>
                    <div class="order-detail-meta">
                        <span>${formatPrice(item.price)}</span>
                        <span>x ${item.quantity}</span>
                    </div>
                </div>
                <div class="order-detail-total">${formatPrice(item.total)}</div>
            </div>
        `).join('');

        // 3. Tính toán phí ship (Giả định lại logic cũ)
        const subtotal = items.reduce((sum, i) => sum + i.total, 0);
        const shippingFee = info.total - subtotal;

        // 4. Tạo Modal Full
        const modalHTML = `
            <div id="orderDetailModal" class="modal-overlay show" onclick="closeOrderDetail(event)">
                <div class="modal-content-wrapper">
                    <div class="modal-content">
                        <button class="modal-close-btn" onclick="closeOrderDetail()">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                            <h2 style="font-family:var(--font-serif); margin:0;">Chi tiết đơn hàng</h2>
                            <span style="color:var(--gray-500);">#${info.id}</span>
                        </div>

                        ${timelineHTML}

                        <div class="order-info-section">
                            <div class="info-row">
                                <div class="info-label">Địa chỉ nhận hàng:</div>
                                <div class="info-val">${info.address || 'Chưa cập nhật địa chỉ'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Ngày đặt:</div>
                                <div class="info-val">${new Date(info.date).toLocaleString('vi-VN')}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Trạng thái:</div>
                                <div class="info-val" style="color:var(--amber-700)">${info.status}</div>
                            </div>
                        </div>

                        <div class="order-detail-list">
                            ${itemsHTML}
                        </div>

                        <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid #eee;">
                            <div class="summary-row"><span>Tổng tiền hàng:</span> <span>${formatPrice(subtotal)}</span></div>
                            <div class="summary-row"><span>Phí vận chuyển:</span> <span>${formatPrice(shippingFee)}</span></div>
                            <div class="summary-total" style="font-size:1.25rem; margin-top:0.5rem;">
                                <span>Thành tiền:</span>
                                <span style="color:var(--amber-700)">${formatPrice(info.total)}</span>
                            </div>
                        </div>

                        <div style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:1rem;">
                            ${info.status === 'Chờ xử lý' ? `
                                <button class="btn btn-danger" onclick="handleCancelOrder('${info.id}')">Hủy đơn hàng</button>
                            ` : ''}
                            <button class="btn btn-primary" onclick="closeOrderDetail()">Đóng</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (error) {
        console.error(error);
        showToast('Lỗi: ' + error.message, 'error');
    }
}

// --- HÀM 1: HIỆN POPUP XÁC NHẬN ĐẸP MẮT ---
function handleCancelOrder(orderId) {
    const safeOrderId = String(orderId).replace(/[<>"']/g, '');

    // Tạo HTML cho Popup xác nhận
    const confirmHTML = `
        <div id="confirmModal" class="modal-overlay show" style="z-index: 10000;">
            <div class="modal-content-wrapper" style="width: auto;">
                <div class="modal-content confirm-modal-content">
                    <div class="confirm-icon">
                        <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>

                    <h3 class="confirm-title">Xác nhận hủy đơn</h3>
                    <p class="confirm-text">
                        Bạn có chắc chắn muốn hủy đơn hàng <b>#${safeOrderId}</b> không?
                        <br>Hành động này không thể hoàn tác.
                    </p>

                    <div class="confirm-actions">
                        <button class="btn btn-outline" onclick="document.getElementById('confirmModal').remove()">
                            Không, giữ lại
                        </button>
                        <button class="btn btn-danger" onclick="processCancelOrder('${safeOrderId}')">
                            Đồng ý hủy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Chèn vào trang web
    document.body.insertAdjacentHTML('beforeend', confirmHTML);
}

// --- HÀM 2: XỬ LÝ HỦY ĐƠN (GỌI API) ---
async function processCancelOrder(orderId) {
    // Xóa popup xác nhận trước
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.remove();

    try {
        showToast('Đang xử lý hủy đơn...', 'info');

        const response = await fetch('/api/orders/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Đã hủy đơn hàng thành công!', 'success');

            // Đóng modal chi tiết đơn hàng
            closeOrderDetail();

            // Tải lại trang lịch sử đơn hàng
            const newHtml = await renderOrderHistoryPage();
            document.getElementById('app').innerHTML = newHtml;

            // Cập nhật lại kho
            await loadData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối server', 'error');
    }
}

// Hàm đóng modal
function closeOrderDetail(event) {
    // Nếu có event (click nền), kiểm tra target. Nếu không (gọi trực tiếp), đóng luôn.
    if (event && event.target !== event.currentTarget) return;

    const modal = document.getElementById('orderDetailModal');
    if (modal) modal.remove();
}

// --- TOGGLE PASSWORD VISIBILITY ---
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

// --- TRANG QUÊN MẬT KHẨU ---
function renderForgotPasswordPage() {
    return `
        <div class="auth-page">
            <div class="auth-form-container" style="backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                <div style="text-align:center; margin-bottom:1.5rem;">
                    <div style="width:3.5rem;height:3.5rem;background:linear-gradient(135deg,var(--amber-400),var(--amber-600));border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;box-shadow:0 8px 20px rgba(217,119,6,0.3);">
                        <svg style="width:1.5rem;height:1.5rem;color:white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h1 class="auth-title">Quên mật khẩu</h1>
                    <p class="auth-subtitle">Nhập email để nhận hướng dẫn đặt lại mật khẩu</p>
                </div>

                <form class="auth-form" onsubmit="handleForgotPassword(event)">
                    <div class="form-group">
                        <label for="resetEmail">Email đã đăng ký</label>
                        <input type="email" id="resetEmail" class="form-control" required placeholder="you@email.com">
                    </div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem; padding: 0.85rem;">
                        Gửi yêu cầu đặt lại
                    </button>

                    <p class="form-link-bottom">
                        <a href="#login">← Quay lại đăng nhập</a>
                    </p>
                </form>
            </div>
        </div>
    `;
}

function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('resetEmail').value;
    showToast('Nếu email ' + email + ' tồn tại trong hệ thống, bạn sẽ nhận được email hướng dẫn đặt lại mật khẩu.', 'success');
    setTimeout(() => navigateTo('login'), 3000);
}