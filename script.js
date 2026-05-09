const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwgbYI51EUJDgjw8-f1oP6K7h_0zIHaPRPFmpV7GI6S88QrDO8rS25uasnSgoJOPPo/exec";

let transactions = [];

// 1. Tự động thiết lập ngày tháng khi mở App
document.getElementById('date').valueAsDate = new Date();

// 2. Hàm lấy dữ liệu từ Google Sheets
async function loadDataFromSheets() {
    try {
        const response = await fetch(SCRIPT_URL);
        transactions = await response.json();
        generateMonthOptions(); // Cập nhật danh sách tháng trong dropdown
        renderData();           // Vẽ bảng và danh sách
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
    }
}

// 3. Hàm tạo danh sách tháng cho Dropdown dựa trên dữ liệu thực tế
function generateMonthOptions() {
    const monthSelect = document.getElementById('monthFilter');
    if (!monthSelect) return;

    const months = new Set();
    const currentMonth = new Date().toISOString().slice(0, 7);
    months.add(currentMonth);

    // Lấy tất cả các tháng có trong dữ liệu
    transactions.forEach(t => {
        if (t.date) months.add(t.date.slice(0, 7));
    });

    const sortedMonths = Array.from(months).sort().reverse();
    
    // Giữ lại giá trị đang chọn nếu có, nếu không thì chọn tháng hiện tại
    const selectedBefore = monthSelect.value || currentMonth;
    
    monthSelect.innerHTML = sortedMonths.map(m => 
        `<option value="${m}" ${m === selectedBefore ? 'selected' : ''}>Tháng ${m}</option>`
    ).join('');
}

// 4. Hàm thêm giao dịch mới lên Google Sheets
async function addItem() {
    const payer = document.getElementById('payer').value;
    const category = document.getElementById('category').value;
    const description = document.getElementById('description').value;
    const amount = parseInt(document.getElementById('amount').value);
    const date = document.getElementById('date').value;

    if (!description || !amount || !date) {
        alert("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    const item = {
        id: Date.now(),
        payer: payer,
        category: category,
        description: description,
        amount: amount,
        date: date
    };

    // Hiển thị trạng thái đang xử lý (tùy chọn)
    const btn = document.querySelector("button");
    const originalText = btn.innerText;
    btn.innerText = "Đang gửi...";
    btn.disabled = true;

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(item)
        });

        // Xóa nội dung nhập sau khi thành công
        document.getElementById('description').value = '';
        document.getElementById('amount').value = '';
        
        // Tải lại dữ liệu mới nhất từ Sheets
        await loadDataFromSheets();
    } catch (error) {
        alert("Có lỗi xảy ra khi gửi dữ liệu!");
        console.error(error);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// 5. Hàm tính toán và hiển thị giao diện
function renderData() {
    const list = document.getElementById('historyList');
    const filterMonth = document.getElementById('monthFilter').value;
    if (!list) return;
    list.innerHTML = '';

    let totalVani = 0;
    let totalIvy = 0;

    // Lọc dữ liệu theo tháng và đảo ngược để cái mới nhất hiện lên đầu
    const filteredData = transactions.filter(item => item.date && item.date.startsWith(filterMonth));

    filteredData.slice().reverse().forEach(item => {
        if (item.payer === 'Vani') totalVani += item.amount;
        else totalIvy += item.amount;

        const li = document.createElement('li');
        li.innerHTML = `
            <span>[${item.date}] <b>${item.payer}</b>: ${item.description} (<i>${item.category}</i>)</span>
            <span class="amt">${item.amount.toLocaleString()}đ</span>
        `;
        list.appendChild(li);
    });

    // Cập nhật bảng tổng kết bên phải
    document.getElementById('grandTotal').innerText = (totalVani + totalIvy).toLocaleString() + 'đ';
    document.getElementById('vaniTotal').innerText = totalVani.toLocaleString() + 'đ';
    document.getElementById('ivyTotal').innerText = totalIvy.toLocaleString() + 'đ';

    // Tính toán ai nợ ai (Chia đôi)
    const balance = (totalVani - totalIvy) / 2;
    const statusEl = document.getElementById('balanceStatus');

    if (balance > 0) {
        statusEl.innerText = `➡️ Ivy cần trả Vani: ${Math.abs(balance).toLocaleString()}đ`;
        statusEl.className = "text-vani"; // Bạn có thể thêm màu trong CSS
        statusEl.style.color = "#007bff";
    } else if (balance < 0) {
        statusEl.innerText = `➡️ Vani cần trả Ivy: ${Math.abs(balance).toLocaleString()}đ`;
        statusEl.style.color = "#d9534f";
    } else {
        statusEl.innerText = "🙌 Đang hòa nhau";
        statusEl.style.color = "#28a745";
    }
}

// Khởi chạy App: Tải dữ liệu ngay khi mở trang
loadDataFromSheets();