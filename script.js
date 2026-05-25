const CATEGORY_BUDGETS = {
    "Ăn uống": 3600000,
    "Mèo": 500000,
    "Xăng xe": 300000,
    "Thiết yếu": 300000,
    "Cố định": 5500000,
    "Ăn ngoài": 1200000,
    "Khác": 1200000
};

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwgbYI51EUJDgjw8-f1oP6K7h_0zIHaPRPFmpV7GI6S88QrDO8rS25uasnSgoJOPPo/exec";

let transactions = [];

const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const monthFilter = document.getElementById('monthFilter');
const submitBtn = document.getElementById('submitBtn');

dateInput.valueAsDate = new Date();

amountInput.addEventListener('input', function (e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value === '') {
        e.target.value = '';
        return;
    }
    e.target.value = Number(value).toLocaleString('vi-VN');
});

monthFilter.addEventListener('change', renderData);
submitBtn.addEventListener('click', addItem);

function formatCurrency(amount) {
    return Math.round(amount).toLocaleString('vi-VN') + 'đ';
}

function normalizeAmount(value) {
    if (typeof value === 'number') return value;
    return Number(String(value).replace(/[^\d]/g, '')) || 0;
}

function parseLocalDate(value) {
    if (!value) return null;

    const normalized = String(value).trim();
    const dateParts = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

    if (dateParts) {
        const [, year, month, day] = dateParts.map(Number);
        return new Date(year, month - 1, day);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthKey(value) {
    const date = parseLocalDate(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function formatDisplayDate(value) {
    const date = parseLocalDate(value);
    if (!date) return 'N/A';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
}

function createTextElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

async function loadDataFromSheets() {
    generateMonthOptions();
    renderData();

    try {
        const response = await fetch(SCRIPT_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        transactions = await response.json();
        generateMonthOptions();
        renderData();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
    }
}

// 4. Tạo menu chọn tháng
function generateMonthOptions() {
    if (!monthFilter) return;

    const months = new Set();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    months.add(currentMonth);
    transactions.forEach(t => {
        const monthKey = getMonthKey(t.date);
        if (monthKey) months.add(monthKey);
    });

    const sortedMonths = Array.from(months).sort().reverse();
    const selectedBefore = monthFilter.value || currentMonth;

    monthFilter.innerHTML = '';
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        const [year, monthNumber] = month.split('-');

        option.value = month;
        option.textContent = `Tháng ${monthNumber}/${year}`;
        option.selected = month === selectedBefore;
        monthFilter.appendChild(option);
    });
}

async function addItem() {
    const payer = document.getElementById('payer').value;
    const category = document.getElementById('category').value;
    const descriptionInput = document.getElementById('description');
    const description = descriptionInput.value.trim();
    const amount = normalizeAmount(amountInput.value);

    if (!description || amount <= 0 || !dateInput.value) {
        alert("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    const item = {
        id: Date.now(),
        payer,
        category,
        description,
        amount,
        date: dateInput.value.replace(/-/g, '/')
    };

    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Đang gửi...";
    submitBtn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(item)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        descriptionInput.value = '';
        amountInput.value = '';
        await loadDataFromSheets();
    } catch (error) {
        alert("Có lỗi xảy ra khi gửi dữ liệu!");
        console.error(error);
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
}

function renderData() {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';
    let totalVani = 0;
    let totalIvy = 0;

    const filteredData = transactions.filter(item => {
        return getMonthKey(item.date) === monthFilter.value;
    });

    renderBudgetReport(filteredData);

    filteredData.slice().reverse().forEach(item => {
        const amount = normalizeAmount(item.amount);
        const li = document.createElement('li');
        const details = document.createElement('span');
        const dateLabel = createTextElement('small', `[${formatDisplayDate(item.date)}] `, 'date-label');
        const title = createTextElement('b', `${item.payer} - ${item.category}`);
        const amountEl = createTextElement('span', formatCurrency(amount), 'amt');

        if (item.payer === 'Vani') totalVani += amount;
        else totalIvy += amount;

        details.append(dateLabel, title, `: ${item.description}`);
        li.append(details, amountEl);
        list.appendChild(li);
    });

    document.getElementById('grandTotal').innerText = formatCurrency(totalVani + totalIvy);
    document.getElementById('vaniTotal').innerText = formatCurrency(totalVani);
    document.getElementById('ivyTotal').innerText = formatCurrency(totalIvy);

    const balance = (totalVani - totalIvy) / 2;
    const statusEl = document.getElementById('balanceStatus');

    if (balance > 0) {
        statusEl.innerText = `Ivy cần trả Vani: ${formatCurrency(Math.abs(balance))}`;
        statusEl.style.color = "#007bff";
    } else if (balance < 0) {
        statusEl.innerText = `Vani cần trả Ivy: ${formatCurrency(Math.abs(balance))}`;
        statusEl.style.color = "#d9534f";
    } else {
        statusEl.innerText = "Đang hòa nhau";
        statusEl.style.color = "#28a745";
    }
}

function renderBudgetReport(filteredData) {
    const budgetList = document.getElementById('budgetList');
    if (!budgetList) return;
    budgetList.innerHTML = '';

    for (const category in CATEGORY_BUDGETS) {
        const budget = CATEGORY_BUDGETS[category];
        const spent = filteredData
            .filter(item => item.category === category)
            .reduce((sum, item) => sum + normalizeAmount(item.amount), 0);

        const percent = Math.min((spent / budget) * 100, 100);
        let colorClass = 'progress-green';
        let warning = '';

        if (spent >= budget) {
            colorClass = 'progress-red';
            warning = 'Vượt định mức';
        } else if (spent >= budget * 0.8) {
            colorClass = 'progress-yellow';
        }

        budgetList.innerHTML += `
            <div class="budget-item">
                <div class="budget-top">
                    <span>${category}</span>
                    <span>${spent.toLocaleString('vi-VN')} / ${formatCurrency(budget)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${colorClass}" style="width:${percent}%"></div>
                </div>
                ${warning ? `<div class="warning-text">${warning}</div>` : ''}
            </div>
        `;
    }
}

loadDataFromSheets();
