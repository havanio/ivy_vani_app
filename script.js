const CATEGORY_BUDGETS = {
    "Ăn uống": 3600000,
    "Mèo": 500000,
    "Xăng xe": 200000,
    "Thiết yếu": 300000,
    "Cố định": 4000000,
    "Ăn ngoài": 1000000,
    "Khác": 2000000
};

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwgbYI51EUJDgjw8-f1oP6K7h_0zIHaPRPFmpV7GI6S88QrDO8rS25uasnSgoJOPPo/exec";

let transactions = [];

// 1. Tự động đặt ngày hôm nay (giờ địa phương)
document.getElementById('date').valueAsDate = new Date();

// 2. Định dạng tiền tệ realtime
const amountInput = document.getElementById('amount');
amountInput.addEventListener('input', function (e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value === '') {
        e.target.value = '';
        return;
    }
    e.target.value = Number(value).toLocaleString('vi-VN');
});

// 3. Tải dữ liệu từ Google Sheets
async function loadDataFromSheets() {
    try {
        const response = await fetch(SCRIPT_URL);
        transactions = await response.json();
        generateMonthOptions();
        renderData();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
    }
}

// 4. Tạo menu chọn tháng
function generateMonthOptions() {
    const monthSelect = document.getElementById('monthFilter');
    if (!monthSelect) return;

    const months = new Set();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    months.add(currentMonth);
    transactions.forEach(t => {
        if (t.date) {
            // Lấy YYYY-MM từ chuỗi ngày
            months.add(t.date.substring(0, 7).replace(/\//g, '-'));
        }
    });

    const sortedMonths = Array.from(months).sort().reverse();
    const selectedBefore = monthSelect.value || currentMonth;

    monthSelect.innerHTML = sortedMonths.map(m => `
        <option value="${m}" ${m === selectedBefore ? 'selected' : ''}>
            Tháng ${m.split('-')[1]}/${m.split('-')[0]}
        </option>
    `).join('');
}

// 5. Thêm khoản chi mới (ĐÃ SỬA LỖI NGÀY)
async function addItem() {
    const payer = document.getElementById('payer').value;
    const category = document.getElementById('category').value;
    const description = document.getElementById('description').value;
    const amountRaw = document.getElementById('amount').value.replace(/\./g, '');
    const amount = parseInt(amountRaw);
    const dateInput = document.getElementById('date').value;

    if (!description || !amount || !dateInput) {
        alert("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    // SỬA TẠI ĐÂY: Dùng dấu / thay vì - để tránh lỗi lùi ngày do múi giờ
    const formattedDate = dateInput.replace(/-/g, '/');

    const item = {
        id: Date.now(),
        payer,
        category,
        description,
        amount,
        date: formattedDate 
    };

    const btn = document.querySelector("button[onclick='addItem()']");
    const originalText = btn.innerText;
    btn.innerText = "Đang gửi...";
    btn.disabled = true;

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(item)
        });

        document.getElementById('description').value = '';
        document.getElementById('amount').value = '';
        await loadDataFromSheets();
    } catch (error) {
        alert("Có lỗi xảy ra khi gửi dữ liệu!");
        console.error(error);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// 6. Hiển thị dữ liệu lên giao diện
function renderData() {
    const list = document.getElementById('historyList');
    const filterMonth = document.getElementById('monthFilter').value; // Dạng YYYY-MM
    if (!list) return;

    list.innerHTML = '';
    let totalVani = 0;
    let totalIvy = 0;

    // Lọc theo tháng (xử lý cả dấu - và /)
    const filteredData = transactions.filter(item => {
        if (!item.date) return false;
        const itemMonth = item.date.substring(0, 7).replace(/\//g, '-');
        return itemMonth === filterMonth;
    });

    renderBudgetReport(filteredData);

    filteredData.slice().reverse().forEach(item => {
        if (item.payer === 'Vani') totalVani += item.amount;
        else totalIvy += item.amount;

        // Định dạng ngày hiển thị dd/mm/yyyy
        const d = new Date(item.date.replace(/-/g, '/'));
        const displayDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        const li = document.createElement('li');
        li.innerHTML = `
            <span>
                <small class="date-label">[${displayDate}]</small> 
                <b>${item.payer}</b>: ${item.description} 
                <span class="cat-tag">${item.category}</span>
            </span>
            <span class="amt">${item.amount.toLocaleString('vi-VN')}đ</span>
        `;
        list.appendChild(li);
    });

    // Cập nhật bảng tổng kết
    document.getElementById('grandTotal').innerText = (totalVani + totalIvy).toLocaleString('vi-VN') + 'đ';
    document.getElementById('vaniTotal').innerText = totalVani.toLocaleString('vi-VN') + 'đ';
    document.getElementById('ivyTotal').innerText = totalIvy.toLocaleString('vi-VN') + 'đ';

    const balance = (totalVani - totalIvy) / 2;
    const statusEl = document.getElementById('balanceStatus');

    if (balance > 0) {
        statusEl.innerText = `➡️ Ivy cần trả Vani: ${Math.abs(balance).toLocaleString('vi-VN')}đ`;
        statusEl.style.color = "#007bff";
    } else if (balance < 0) {
        statusEl.innerText = `➡️ Vani cần trả Ivy: ${Math.abs(balance).toLocaleString('vi-VN')}đ`;
        statusEl.style.color = "#d9534f";
    } else {
        statusEl.innerText = "🙌 Đang hòa nhau";
        statusEl.style.color = "#28a745";
    }
}

// 7. Báo cáo ngân sách
function renderBudgetReport(filteredData) {
    const budgetList = document.getElementById('budgetList');
    if (!budgetList) return;
    budgetList.innerHTML = '';

    for (const category in CATEGORY_BUDGETS) {
        const budget = CATEGORY_BUDGETS[category];
        const spent = filteredData
            .filter(item => item.category === category)
            .reduce((sum, item) => sum + item.amount, 0);

        const percent = Math.min((spent / budget) * 100, 100);
        let colorClass = 'progress-green';
        let warning = '';

        if (spent >= budget) {
            colorClass = 'progress-red';
            warning = '⚠️ Vượt định mức';
        } else if (spent >= budget * 0.8) {
            colorClass = 'progress-yellow';
        }

        budgetList.innerHTML += `
            <div class="budget-item">
                <div class="budget-top">
                    <span>${category}</span>
                    <span>${spent.toLocaleString('vi-VN')} / ${budget.toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${colorClass}" style="width:${percent}%"></div>
                </div>
                ${warning ? `<div class="warning-text">${warning}</div>` : ''}
            </div>
        `;
    }
}

// Khởi chạy app
loadDataFromSheets();