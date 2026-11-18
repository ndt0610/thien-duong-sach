// ===== STAFF.JS - Logic trang nhân viên =====
const API = '';
let token = localStorage.getItem('authToken');
let allBooks = [], allOrders = [], allCategories = [], allAuthors = [], allSuppliers = [];
let pollingInterval = null;

// ==================== GLOBAL FETCH INTERCEPTOR ====================
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const res = await originalFetch(...args);
    if (res.status === 401 || res.status === 403) {
        logout(); // Token hết hạn hoặc không có quyền
    }
    return res;
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    startPolling();
});

// Auto-reload data khi quay lại tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        refreshCurrentTab();
    }
});

function refreshCurrentTab() {
    const activeTab = document.querySelector('.tab-content > div.active');
    if (!activeTab) return;
    const tabId = activeTab.id.replace('tab-', '');
    if (tabId === 'overview') loadOverview();
    if (tabId === 'orders') loadOrders();
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        refreshCurrentTab();
    }, 15000); // 15 giây
}

async function checkAuth() {
    if (!token) return logout();
    try {
        const res = await fetch(API + '/api/verify-token', { headers: headers() });
        const data = await res.json();
        if (!data.success || (data.user.role !== 'STAFF' && data.user.role !== 'ADMIN')) return logout();

        document.getElementById('staffGreeting').textContent = 'Xin chào, ' + (data.user.name || data.user.email);
        loadOverview();
    } catch (e) {
        console.warn('Network error checking auth, skipping redirect...');
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (!user.role || (user.role !== 'STAFF' && user.role !== 'ADMIN')) return logout();
        document.getElementById('staffGreeting').textContent = 'Xin chào, ' + (user.name || user.email);
        loadOverview();
    }
}

function headers() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

function toast(msg, type = 'success') {
    const box = document.getElementById('toast-box');
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeftColor = type === 'error' ? 'var(--red)' : 'var(--pri)';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function fmt(n) { return Number(n || 0).toLocaleString('vi-VN') + '₫'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('vi-VN') : ''; }

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm chính xác hơn
function removeAccents(str) {
    if (!str) return "";
    return str.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

function showTab(tab) {
    document.querySelectorAll('.tab-content > div').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    const navLink = document.querySelector(`.sidebar a[onclick*="${tab}"]`);
    if (navLink) navLink.classList.add('active');

    if (tab === 'overview') loadOverview();
    else if (tab === 'books') loadBooks();
    else if (tab === 'orders') loadOrders();
    else if (tab === 'import') loadImports();
    else if (tab === 'manage') { loadCategories(); loadAuthors(); loadSuppliers(); }
}

function showSubTab(name, el) {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['categories', 'authors', 'suppliers'].forEach(s => {
        document.getElementById('sub-' + s).style.display = s === name ? '' : 'none';
    });
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/login.html';
}

// ===== OVERVIEW =====
async function loadOverview() {
    try {
        const [booksRes, ordersRes] = await Promise.all([
            fetch(API + '/api/books').then(r => r.json()),
            fetch(API + '/api/admin/orders', { headers: headers() }).then(r => r.json())
        ]);
        const books = booksRes.books || booksRes || [];
        const orders = ordersRes.orders || ordersRes || [];
        const pending = orders.filter(o => o.status === 'Chờ xử lý');
        const lowStock = books.filter(b => (b.stockCount || 0) < 5);

        document.getElementById('overviewStats').innerHTML = `
            <div class="stat-card"><div class="stat-value" style="color:var(--pri)">${books.length}</div><div class="stat-label">Tổng sách</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--amber)">${pending.length}</div><div class="stat-label">Đơn chờ xử lý</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--red)">${lowStock.length}</div><div class="stat-label">Sách sắp hết hàng</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--green)">${orders.filter(o => o.status === 'Đã giao').length}</div><div class="stat-label">Đã giao thành công</div></div>`;

        document.getElementById('pendingOrdersBody').innerHTML = pending.slice(0, 5).map(o => `
            <tr>
                <td><strong>${o.id}</strong></td>
                <td>${o.customerName || 'Khách vãng lai'}</td>
                <td>${fmtDate(o.date)}</td>
                <td><strong>${fmt(o.total)}</strong></td>
                <td><button class="btn btn-pri btn-sm" onclick="confirmOrder('${o.id}')">Xác nhận</button>
                    <button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')">Hủy</button></td>
            </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-l)">Không có đơn cần xử lý</td></tr>';
    } catch (e) { console.error(e); }
}

// ===== BOOKS =====
async function loadBooks() {
    try {
        const res = await fetch(API + '/api/books');
        const data = await res.json();
        allBooks = data.books || data || [];
        renderBooks(allBooks);
    } catch (e) { console.error(e); }
}

function renderBooks(books) {
    window._staffBooks = books;
    document.getElementById('staffBooksBody').innerHTML = books.map((b, index) => `
        <tr>
            <td style="display:flex;align-items:center;gap:.75rem">
                <img src="${(b.coverImage && b.coverImage.startsWith('/')) ? b.coverImage : '/' + (b.coverImage || 'ảnh/uploads/placeholder.jpg')}" class="product-img" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2245%22 height=%2260%22><rect fill=%22%23eee%22 width=%2245%22 height=%2260%22/></svg>'">
                <div><strong>${b.title}</strong><br><span style="font-size:.75rem;color:var(--text-l)">${b.id}</span></div>
            </td>
            <td>${b.author || '—'}</td>
            <td><strong>${fmt(b.price)}</strong></td>
            <td><span class="badge ${(b.stockCount||0)<5?'badge-cancel':'badge-done'}">${b.stockCount || 0}</span></td>
            <td>${b.category || '—'}</td>
            <td>
                <button class="btn btn-out btn-sm" onclick='editBook(${index})'>Sửa</button>
                <button class="btn btn-danger btn-sm" onclick="deleteBook('${b.id}')">Xóa</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:2rem">Chưa có sách</td></tr>';
}

function filterStaffBooks(q) {
    const qLower = q.toLowerCase();
    const qNoAccent = removeAccents(q);

    renderBooks(allBooks.filter(b => {
        const title = (b.title || '').toLowerCase();
        const author = (b.author || '').toLowerCase();
        const id = (b.id || '').toString().toLowerCase();

        const titleNoAccent = removeAccents(title);
        const authorNoAccent = removeAccents(author);

        return title.includes(qLower) ||
               author.includes(qLower) ||
               id.includes(qLower) ||
               titleNoAccent.includes(qNoAccent) ||
               authorNoAccent.includes(qNoAccent);
    }));
}

async function openBookModal(book) {
    await loadDropdowns();
    document.getElementById('bookModalTitle').textContent = book ? 'Sửa thông tin sách' : 'Thêm sách mới';
    document.getElementById('editBookId').value = book ? book.id : '';
    document.getElementById('bkTitle').value = book ? book.title : '';
    document.getElementById('bkPrice').value = book ? book.price : '';
    document.getElementById('bkOrigPrice').value = book ? (book.originalPrice || '') : '';
    document.getElementById('bkStock').value = book ? (book.stockCount || 0) : 0;
    document.getElementById('bkISBN').value = book ? (book.isbn || '') : '';
    document.getElementById('bkPages').value = book ? (book.pages || '') : '';
    document.getElementById('bkLang').value = book ? (book.language || 'Tiếng Việt') : 'Tiếng Việt';
    document.getElementById('bkDate').value = book && book.publishedDate ? book.publishedDate.split('T')[0] : '';
    document.getElementById('bkCover').value = book ? (book.coverImage || '') : '';
    document.getElementById('bkDesc').value = book ? (book.description || '') : '';
    document.getElementById('bkCat').value = book ? (book.categoryId || '') : '';
    document.getElementById('bkAuthor').value = book ? (book.authorId || '') : '';
    document.getElementById('bkSupplier').value = book ? (book.supplierId || '') : '';
    const prev = document.getElementById('previewImg');
    if (book && book.coverImage) { prev.src = '/' + book.coverImage; prev.style.display = 'block'; }
    else { prev.style.display = 'none'; }
    document.getElementById('bookModal').classList.add('show');
}

function editBook(idx) {
    const b = window._staffBooks[idx];
    openBookModal(b);
}

async function loadDropdowns() {
    const [cats, auths, supps] = await Promise.all([
        fetch(API + '/api/staff/categories', { headers: headers() }).then(r => r.json()),
        fetch(API + '/api/staff/authors', { headers: headers() }).then(r => r.json()),
        fetch(API + '/api/staff/suppliers', { headers: headers() }).then(r => r.json())
    ]);
    allCategories = cats.categories || [];
    allAuthors = auths.authors || [];
    allSuppliers = supps.suppliers || [];
    document.getElementById('bkCat').innerHTML = '<option value="">Chọn thể loại</option>' + allCategories.map(c => `<option value="${c.MaTL}">${c.TenTL}</option>`).join('');
    document.getElementById('bkAuthor').innerHTML = '<option value="">Chọn tác giả</option>' + allAuthors.map(a => `<option value="${a.MaTG}">${a.TenTG}</option>`).join('');
    document.getElementById('bkSupplier').innerHTML = '<option value="">Chọn NCC</option>' + allSuppliers.map(s => `<option value="${s.MaNCC}">${s.TenNCC}</option>`).join('');
}

async function handleFileUpload(input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('image', input.files[0]);
    try {
        const res = await fetch(API + '/api/staff/upload-image', { method: 'POST', headers: headers(), body: formData });
        const data = await res.json();
        if (data.success) {
            document.getElementById('bkCover').value = data.path;
            const prev = document.getElementById('previewImg');
            prev.src = '/' + data.path; prev.style.display = 'block';
            toast('Upload ảnh thành công!');
        } else { toast(data.message || 'Lỗi upload', 'error'); }
    } catch (e) { toast('Lỗi upload: ' + e.message, 'error'); }
}

async function handleBookSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editBookId').value;
    const body = {
        title: document.getElementById('bkTitle').value,
        price: Number(document.getElementById('bkPrice').value),
        originalPrice: Number(document.getElementById('bkOrigPrice').value) || 0,
        stock: Number(document.getElementById('bkStock').value) || 0,
        categoryId: Number(document.getElementById('bkCat').value),
        authorId: document.getElementById('bkAuthor').value ? Number(document.getElementById('bkAuthor').value) : null,
        supplierId: document.getElementById('bkSupplier').value || null,
        isbn: document.getElementById('bkISBN').value || null,
        pages: Number(document.getElementById('bkPages').value) || null,
        language: document.getElementById('bkLang').value,
        publishedDate: document.getElementById('bkDate').value || null,
        coverImage: document.getElementById('bkCover').value,
        description: document.getElementById('bkDesc').value
    };
    try {
        const url = id ? API + '/api/staff/books/' + id : API + '/api/staff/books';
        const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) { toast(id ? 'Cập nhật thành công!' : 'Thêm sách thành công!'); closeModal('bookModal'); loadBooks(); }
        else toast(data.message || 'Lỗi', 'error');
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteBook(id) {
    if (!confirm('Xóa sách ' + id + '?')) return;
    try {
        const res = await fetch(API + '/api/staff/books/' + id, { method: 'DELETE', headers: headers() });
        const data = await res.json();
        if (data.success) { toast('Đã xóa!'); loadBooks(); }
        else toast(data.message, 'error');
    } catch (e) { toast(e.message, 'error'); }
}

// ===== ORDERS =====
async function loadOrders() {
    try {
        const res = await fetch(API + '/api/admin/orders', { headers: headers() });
        const data = await res.json();
        allOrders = (data.orders || data || []);
        renderOrders(allOrders);
    } catch (e) { console.error(e); }
}

function renderOrders(orders) {
    const badgeClass = s => s === 'Chờ xử lý' ? 'badge-wait' : s === 'Đang giao' ? 'badge-ship' : s === 'Đã giao' ? 'badge-done' : 'badge-cancel';
    document.getElementById('staffOrdersBody').innerHTML = orders.map(o => `
        <tr>
            <td><strong>${o.id}</strong></td>
            <td>${o.customerName || 'Khách vãng lai'}</td>
            <td>${fmtDate(o.date)}</td>
            <td><strong>${fmt(o.total)}</strong></td>
            <td><span class="badge ${badgeClass(o.status)}">${o.status}</span></td>
            <td>${o.status === 'Chờ xử lý' ? `
                <button class="btn btn-pri btn-sm" onclick="confirmOrder('${o.id}')">Xác nhận</button>
                <button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')">Hủy</button>` : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:2rem">Không có đơn hàng</td></tr>';
}

function filterStaffOrders(s) { renderOrders(s ? allOrders.filter(o => o.status === s) : allOrders); }

async function confirmOrder(id) {
    if (!confirm('Xác nhận đơn ' + id + '? Đơn sẽ chuyển sang Chờ lấy hàng cho Shipper.')) return;
    try {
        const res = await fetch(API + '/api/admin/orders/update-status', {
            method: 'POST', headers: headers(), body: JSON.stringify({ orderId: id, status: 'Chờ lấy hàng' })
        });
        const data = await res.json();
        if (data.success) { toast('Đã xác nhận đơn!'); loadOrders(); loadOverview(); }
        else toast(data.message, 'error');
    } catch (e) { toast(e.message, 'error'); }
}

async function cancelOrder(id) {
    if (!confirm('Hủy đơn ' + id + '?')) return;
    try {
        const res = await fetch(API + '/api/admin/orders/update-status', {
            method: 'POST', headers: headers(), body: JSON.stringify({ orderId: id, status: 'Đã hủy' })
        });
        const data = await res.json();
        if (data.success) { toast('Đã hủy đơn!'); loadOrders(); loadOverview(); }
        else toast(data.message, 'error');
    } catch (e) { toast(e.message, 'error'); }
}

// ===== IMPORTS =====
async function loadImports() {
    try {
        const res = await fetch(API + '/api/staff/imports', { headers: headers() });
        const data = await res.json();
        document.getElementById('importsBody').innerHTML = (data.imports || []).map(i => `
            <tr>
                <td><strong>${i.MaPN}</strong></td>
                <td>${fmtDate(i.NgayNhap)}</td>
                <td>${i.TenNCC || '—'}</td>
                <td>${i.SoMatHang || 0}</td>
                <td><strong>${fmt(i.TongTienNhap)}</strong></td>
                <td>${i.GhiChu || '—'}</td>
            </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:2rem">Chưa có phiếu nhập</td></tr>';
    } catch (e) { console.error(e); }
}

async function openImportModal() {
    await loadDropdowns();
    document.getElementById('impSupplier').innerHTML = '<option value="">Chọn NCC</option>' + allSuppliers.map(s => `<option value="${s.MaNCC}">${s.TenNCC}</option>`).join('');
    document.getElementById('importItems').innerHTML = '';
    document.getElementById('importTotal').textContent = '0₫';
    document.getElementById('impNote').value = '';
    addImportItem();
    document.getElementById('importModal').classList.add('show');
}

function addImportItem() {
    const div = document.getElementById('importItems');
    const item = document.createElement('div');
    item.className = 'import-item';
    item.innerHTML = `
        <select class="imp-book">${allBooks.length ? allBooks.map(b => `<option value="${b.id}">${b.title}</option>`).join('') : '<option>Đang tải...</option>'}</select>
        <input type="number" class="imp-qty" placeholder="SL" min="1" value="1" onchange="calcImportTotal()">
        <input type="number" class="imp-price" placeholder="Giá nhập" min="0" onchange="calcImportTotal()">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove();calcImportTotal()">✕</button>`;
    div.appendChild(item);
    // Load books if needed
    if (!allBooks.length) {
        fetch(API + '/api/books').then(r => r.json()).then(d => {
            allBooks = d.books || d || [];
            document.querySelectorAll('.imp-book').forEach(sel => {
                sel.innerHTML = allBooks.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
            });
        });
    }
}

function calcImportTotal() {
    let total = 0;
    document.querySelectorAll('.import-item').forEach(item => {
        const qty = Number(item.querySelector('.imp-qty').value) || 0;
        const price = Number(item.querySelector('.imp-price').value) || 0;
        total += qty * price;
    });
    document.getElementById('importTotal').textContent = fmt(total);
}

async function handleImportSubmit(e) {
    e.preventDefault();
    const items = [];
    document.querySelectorAll('.import-item').forEach(item => {
        items.push({
            bookId: item.querySelector('.imp-book').value,
            quantity: Number(item.querySelector('.imp-qty').value),
            price: Number(item.querySelector('.imp-price').value)
        });
    });
    if (!items.length) return toast('Thêm ít nhất 1 sách', 'error');
    try {
        const res = await fetch(API + '/api/staff/imports', {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ supplierId: document.getElementById('impSupplier').value, items, note: document.getElementById('impNote').value })
        });
        const data = await res.json();
        if (data.success) { toast('Nhập kho thành công! Mã: ' + data.importId); closeModal('importModal'); loadImports(); }
        else toast(data.message, 'error');
    } catch (e) { toast(e.message, 'error'); }
}

// ===== CATEGORIES / AUTHORS / SUPPLIERS =====
async function loadCategories() {
    try {
        const res = await fetch(API + '/api/staff/categories', { headers: headers() });
        const data = await res.json();
        allCategories = data.categories || [];
        document.getElementById('catBody').innerHTML = allCategories.map(c => `
            <tr><td>${c.MaTL}</td><td>${c.TenTL}</td><td>${c.MoTa || '—'}</td>
            <td><button class="btn btn-out btn-sm" onclick="openCatModal(${c.MaTL},'${(c.TenTL||'').replace(/'/g,"\\'")}','${(c.MoTa||'').replace(/'/g,"\\'")}')">Sửa</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCat(${c.MaTL})">Xóa</button></td></tr>`).join('');
    } catch (e) { console.error(e); }
}

async function loadAuthors() {
    try {
        const res = await fetch(API + '/api/staff/authors', { headers: headers() });
        const data = await res.json();
        allAuthors = data.authors || [];
        document.getElementById('authorBody').innerHTML = allAuthors.map(a => `
            <tr><td>${a.MaTG}</td><td>${a.TenTG}</td><td>${a.TieuSu || '—'}</td><td>${a.SoSach}</td>
            <td><button class="btn btn-out btn-sm" onclick="openAuthorModal(${a.MaTG},'${(a.TenTG||'').replace(/'/g,"\\'")}','${(a.TieuSu||'').replace(/'/g,"\\'")}')">Sửa</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAuthor(${a.MaTG})">Xóa</button></td></tr>`).join('');
    } catch (e) { console.error(e); }
}

async function loadSuppliers() {
    try {
        const res = await fetch(API + '/api/staff/suppliers', { headers: headers() });
        const data = await res.json();
        allSuppliers = data.suppliers || [];
        document.getElementById('supplierBody').innerHTML = allSuppliers.map(s => `
            <tr><td>${s.MaNCC}</td><td>${s.TenNCC}</td><td>${s.DiaChi || '—'}</td><td>${s.SDT || '—'}</td><td>${s.Email || '—'}</td>
            <td><button class="btn btn-out btn-sm" onclick="openSupplierModal('${s.MaNCC}','${(s.TenNCC||'').replace(/'/g,"\\'")}','${(s.DiaChi||'').replace(/'/g,"\\'")}','${s.SDT||''}','${s.Email||''}','${s.MaSoThue||''}')">Sửa</button></td></tr>`).join('');
    } catch (e) { console.error(e); }
}

function openCatModal(id, name, desc) {
    document.getElementById('simpleModalTitle').textContent = id ? 'Sửa thể loại' : 'Thêm thể loại';
    document.getElementById('simpleEditId').value = id || '';
    document.getElementById('simpleType').value = 'category';
    document.getElementById('simpleFields').innerHTML = `
        <div class="form-group"><label>Tên thể loại *</label><input type="text" id="sfName" value="${name||''}" required></div>
        <div class="form-group"><label>Mô tả</label><textarea id="sfDesc" rows="2">${desc||''}</textarea></div>`;
    document.getElementById('simpleModal').classList.add('show');
}

function openAuthorModal(id, name, bio) {
    document.getElementById('simpleModalTitle').textContent = id ? 'Sửa tác giả' : 'Thêm tác giả';
    document.getElementById('simpleEditId').value = id || '';
    document.getElementById('simpleType').value = 'author';
    document.getElementById('simpleFields').innerHTML = `
        <div class="form-group"><label>Tên tác giả *</label><input type="text" id="sfName" value="${name||''}" required></div>
        <div class="form-group"><label>Tiểu sử</label><textarea id="sfDesc" rows="2">${bio||''}</textarea></div>`;
    document.getElementById('simpleModal').classList.add('show');
}

function openSupplierModal(id, name, addr, phone, email, tax) {
    document.getElementById('simpleModalTitle').textContent = id ? 'Sửa NCC' : 'Thêm nhà cung cấp';
    document.getElementById('simpleEditId').value = id || '';
    document.getElementById('simpleType').value = 'supplier';
    document.getElementById('simpleFields').innerHTML = `
        ${!id ? '<div class="form-group"><label>Mã NCC *</label><input type="text" id="sfId" required></div>' : ''}
        <div class="form-group"><label>Tên NCC *</label><input type="text" id="sfName" value="${name||''}" required></div>
        <div class="form-group"><label>Địa chỉ</label><input type="text" id="sfAddr" value="${addr||''}"></div>
        <div class="form-group"><label>SĐT</label><input type="text" id="sfPhone" value="${phone||''}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="sfEmail" value="${email||''}"></div>
        <div class="form-group"><label>Mã số thuế</label><input type="text" id="sfTax" value="${tax||''}"></div>`;
    document.getElementById('simpleModal').classList.add('show');
}

async function handleSimpleSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('simpleType').value;
    const id = document.getElementById('simpleEditId').value;
    const name = document.getElementById('sfName').value;
    const desc = document.getElementById('sfDesc') ? document.getElementById('sfDesc').value : '';
    let url, body, method;

    if (type === 'category') {
        url = id ? `/api/staff/categories/${id}` : '/api/staff/categories';
        body = { name, description: desc }; method = id ? 'PUT' : 'POST';
    } else if (type === 'author') {
        url = id ? `/api/staff/authors/${id}` : '/api/staff/authors';
        body = { name, bio: desc }; method = id ? 'PUT' : 'POST';
    } else if (type === 'supplier') {
        url = id ? `/api/staff/suppliers/${id}` : '/api/staff/suppliers';
        body = { name, address: document.getElementById('sfAddr').value, phone: document.getElementById('sfPhone').value,
                 email: document.getElementById('sfEmail').value, taxCode: document.getElementById('sfTax').value };
        if (!id) body.id = document.getElementById('sfId').value;
        method = id ? 'PUT' : 'POST';
    }
    try {
        const res = await fetch(API + url, { method, headers: headers(), body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) { toast('Lưu thành công!'); closeModal('simpleModal'); loadCategories(); loadAuthors(); loadSuppliers(); }
        else toast(data.message, 'error');
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteCat(id) {
    if (!confirm('Xóa thể loại?')) return;
    const res = await fetch(API + `/api/staff/categories/${id}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (data.success) { toast('Đã xóa!'); loadCategories(); } else toast(data.message, 'error');
}

async function deleteAuthor(id) {
    if (!confirm('Xóa tác giả?')) return;
    const res = await fetch(API + `/api/staff/authors/${id}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (data.success) { toast('Đã xóa!'); loadAuthors(); } else toast(data.message, 'error');
}

async function deleteSupplier(id) {
    if (!confirm('Xóa NCC này?')) return;
    try {
        const res = await fetch(API + '/api/staff/suppliers/' + id, { method: 'DELETE', headers: headers() });
        const data = await res.json();
        if (data.success) { toast('Đã xóa NCC'); loadSuppliers(); } else { toast(data.message, 'error'); }
    } catch (e) { toast('Lỗi', 'error'); }
}
