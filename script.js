const DEFAULT_CATEGORY_BUDGETS = {
    "Ăn uống": 3600000,
    "Mèo": 500000,
    "Xăng xe": 300000,
    "Thiết yếu": 300000,
    "Cố định": 5500000,
    "Ăn ngoài": 1200000,
    "Khác": 1200000
};

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwgbYI51EUJDgjw8-f1oP6K7h_0zIHaPRPFmpV7GI6S88QrDO8rS25uasnSgoJOPPo/exec";
const BUDGET_STORAGE_KEY = "vani-ivy-category-budgets";

let transactions = [];
let categoryBudgets = loadSavedBudgets();
let canMutateTransactions = false;
let editingTransactionKey = "";

const payerInput = document.getElementById('payer');
const categoryInput = document.getElementById('category');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const monthFilter = document.getElementById('monthFilter');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');
const statusMessage = document.getElementById('statusMessage');
const historyEmpty = document.getElementById('historyEmpty');
const transactionCount = document.getElementById('transactionCount');
const budgetToggleBtn = document.getElementById('budgetToggleBtn');
const budgetEditor = document.getElementById('budgetEditor');

dateInput.valueAsDate = new Date();

amountInput.addEventListener('input', function (e) {
    const value = e.target.value.replace(/\D/g, '');
    e.target.value = value ? Number(value).toLocaleString('vi-VN') : '';
});

monthFilter.addEventListener('change', renderData);
submitBtn.addEventListener('click', saveItem);
cancelEditBtn.addEventListener('click', resetForm);
budgetToggleBtn.addEventListener('click', toggleBudgetEditor);

function loadSavedBudgets() {
    try {
        const saved = JSON.parse(localStorage.getItem(BUDGET_STORAGE_KEY));
        return { ...DEFAULT_CATEGORY_BUDGETS, ...saved };
    } catch (error) {
        return { ...DEFAULT_CATEGORY_BUDGETS };
    }
}

function saveBudgets() {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(categoryBudgets));
}

function formatCurrency(amount) {
    return Math.round(amount).toLocaleString('vi-VN') + 'đ';
}

function formatDateInput(value) {
    const date = parseLocalDate(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function getTransactionKey(item) {
    if (item.id) return String(item.id);
    return [
        item.date,
        item.payer,
        item.category,
        item.description,
        normalizeAmount(item.amount)
    ].join('|');
}

function findTransaction(key) {
    return transactions.find(item => getTransactionKey(item) === key);
}

function createTextElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`.trim();
}

async function loadDataFromSheets() {
    generateMonthOptions();
    renderData();

    try {
        const response = await fetch(SCRIPT_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        transactions = Array.isArray(data) ? data : data.transactions || [];
        canMutateTransactions = !Array.isArray(data) && data.features?.mutations === true;

        generateMonthOptions();
        renderData();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        setStatus("Không tải được dữ liệu mới. Đang hiển thị dữ liệu hiện có.", "error");
    }
}

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

function getFormItem() {
    return {
        id: editingTransactionKey && /^\d+$/.test(editingTransactionKey)
            ? Number(editingTransactionKey)
            : Date.now(),
        payer: payerInput.value,
        category: categoryInput.value,
        description: descriptionInput.value.trim(),
        amount: normalizeAmount(amountInput.value),
        date: dateInput.value.replace(/-/g, '/')
    };
}

async function saveItem() {
    const item = getFormItem();
    const isEditing = Boolean(editingTransactionKey);

    if (!item.description || item.amount <= 0 || !dateInput.value) {
        setStatus("Vui lòng nhập đầy đủ thông tin.", "error");
        return;
    }

    if (isEditing && !canMutateTransactions) {
        setStatus("Cần cập nhật Apps Script trước khi sửa khoản chi.", "error");
        return;
    }

    submitBtn.innerText = isEditing ? "Đang cập nhật..." : "Đang gửi...";
    submitBtn.disabled = true;
    setStatus(isEditing ? "Đang cập nhật khoản chi..." : "Đang lưu khoản chi...");

    try {
        const payload = isEditing
            ? { action: "update", key: editingTransactionKey, item }
            : item;

        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatus(isEditing ? "Đã cập nhật khoản chi." : "Đã ghi nhận khoản chi.", "success");
        resetForm();
        await loadDataFromSheets();
    } catch (error) {
        setStatus("Có lỗi xảy ra khi gửi dữ liệu.", "error");
        console.error(error);
    } finally {
        submitBtn.innerText = editingTransactionKey ? "Cập nhật" : "Ghi nhận";
        submitBtn.disabled = false;
    }
}

function startEdit(key) {
    if (!canMutateTransactions) {
        setStatus("Cần cập nhật Apps Script trước khi sửa khoản chi.", "error");
        return;
    }

    const item = findTransaction(key);
    if (!item) return;

    editingTransactionKey = key;
    payerInput.value = item.payer;
    categoryInput.value = item.category;
    descriptionInput.value = item.description;
    amountInput.value = normalizeAmount(item.amount).toLocaleString('vi-VN');
    dateInput.value = formatDateInput(item.date);
    formTitle.innerText = "Sửa khoản chi";
    submitBtn.innerText = "Cập nhật";
    cancelEditBtn.hidden = false;
    setStatus("Đang sửa khoản chi. Bấm cập nhật để lưu.", "");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
    editingTransactionKey = "";
    descriptionInput.value = '';
    amountInput.value = '';
    dateInput.valueAsDate = new Date();
    formTitle.innerText = "Nhập chi tiêu mới";
    submitBtn.innerText = "Ghi nhận";
    cancelEditBtn.hidden = true;
}

async function deleteItem(key) {
    if (!canMutateTransactions) {
        setStatus("Cần cập nhật Apps Script trước khi xóa khoản chi.", "error");
        return;
    }

    const item = findTransaction(key);
    if (!item) return;

    const confirmed = confirm(`Xóa khoản "${item.description}"?`);
    if (!confirmed) return;

    setStatus("Đang xóa khoản chi...");

    try {
        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "delete", key, item })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatus("Đã xóa khoản chi.", "success");
        if (editingTransactionKey === key) resetForm();
        await loadDataFromSheets();
    } catch (error) {
        setStatus("Có lỗi xảy ra khi xóa dữ liệu.", "error");
        console.error(error);
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

    historyEmpty.style.display = filteredData.length ? 'none' : 'block';
    transactionCount.innerText = `${filteredData.length} khoản`;

    renderBudgetReport(filteredData);

    filteredData.slice().reverse().forEach(item => {
        const key = getTransactionKey(item);
        const amount = normalizeAmount(item.amount);
        const li = document.createElement('li');
        const details = document.createElement('div');
        const title = createTextElement('div', item.description, 'transaction-title');
        const meta = createTextElement(
            'div',
            `${formatDisplayDate(item.date)} · ${item.payer} · ${item.category}`,
            'transaction-meta'
        );
        const side = document.createElement('div');
        const amountEl = createTextElement('span', formatCurrency(amount), 'amt');
        const actions = document.createElement('div');
        const editButton = createRowButton('Sửa', () => startEdit(key));
        const deleteButton = createRowButton('Xóa', () => deleteItem(key), 'danger');

        if (item.payer === 'Vani') totalVani += amount;
        else totalIvy += amount;

        details.className = 'transaction-main';
        side.className = 'transaction-side';
        actions.className = 'transaction-actions';
        editButton.disabled = !canMutateTransactions;
        deleteButton.disabled = !canMutateTransactions;
        editButton.title = canMutateTransactions ? 'Sửa khoản chi' : 'Cần cập nhật Apps Script';
        deleteButton.title = canMutateTransactions ? 'Xóa khoản chi' : 'Cần cập nhật Apps Script';

        details.append(title, meta);
        actions.append(editButton, deleteButton);
        side.append(amountEl, actions);
        li.append(details, side);
        list.appendChild(li);
    });

    document.getElementById('grandTotal').innerText = formatCurrency(totalVani + totalIvy);
    document.getElementById('vaniTotal').innerText = formatCurrency(totalVani);
    document.getElementById('ivyTotal').innerText = formatCurrency(totalIvy);

    const balance = (totalVani - totalIvy) / 2;
    const statusEl = document.getElementById('balanceStatus');

    if (balance > 0) {
        statusEl.innerText = `Ivy cần trả Vani: ${formatCurrency(Math.abs(balance))}`;
        statusEl.style.background = "#eef6ff";
        statusEl.style.color = "#2563eb";
    } else if (balance < 0) {
        statusEl.innerText = `Vani cần trả Ivy: ${formatCurrency(Math.abs(balance))}`;
        statusEl.style.background = "#fff1f1";
        statusEl.style.color = "#d64545";
    } else {
        statusEl.innerText = "Đang hòa nhau";
        statusEl.style.background = "#effaf4";
        statusEl.style.color = "#17704a";
    }
}

function createRowButton(label, onClick, tone = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = `row-action ${tone}`.trim();
    button.addEventListener('click', onClick);
    return button;
}

function renderBudgetReport(filteredData) {
    const budgetList = document.getElementById('budgetList');
    if (!budgetList) return;
    budgetList.innerHTML = '';

    for (const category in categoryBudgets) {
        const budget = categoryBudgets[category];
        const spent = filteredData
            .filter(item => item.category === category)
            .reduce((sum, item) => sum + normalizeAmount(item.amount), 0);

        const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
        let colorClass = 'progress-green';
        let warning = '';

        if (budget > 0 && spent >= budget) {
            colorClass = 'progress-red';
            warning = 'Vượt định mức';
        } else if (budget > 0 && spent >= budget * 0.8) {
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

function toggleBudgetEditor() {
    budgetEditor.hidden = !budgetEditor.hidden;
    budgetToggleBtn.innerText = budgetEditor.hidden ? "Chỉnh ngân sách" : "Ẩn chỉnh sửa";
    if (!budgetEditor.hidden) renderBudgetEditor();
}

function renderBudgetEditor() {
    budgetEditor.innerHTML = '';

    for (const category in categoryBudgets) {
        const label = document.createElement('label');
        const name = createTextElement('span', category);
        const input = document.createElement('input');

        label.className = 'budget-field';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.value = categoryBudgets[category].toLocaleString('vi-VN');
        input.addEventListener('input', event => {
            const value = event.target.value.replace(/\D/g, '');
            categoryBudgets[category] = Number(value) || 0;
            event.target.value = value ? Number(value).toLocaleString('vi-VN') : '';
            saveBudgets();
            renderData();
        });

        label.append(name, input);
        budgetEditor.appendChild(label);
    }

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'secondary-button';
    resetButton.textContent = 'Khôi phục ngân sách mặc định';
    resetButton.addEventListener('click', () => {
        categoryBudgets = { ...DEFAULT_CATEGORY_BUDGETS };
        saveBudgets();
        renderBudgetEditor();
        renderData();
    });
    budgetEditor.appendChild(resetButton);
}

loadDataFromSheets();
