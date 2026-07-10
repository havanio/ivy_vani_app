const CATEGORY_BUDGETS = {
    "Ăn uống": 3600000,
    "Mèo": 500000,
    "Xăng xe": 300000,
    "Thiết yếu": 300000,
    "Cố định": 1500000,
    "Ăn ngoài": 1200000,
    "Khác": 1200000
};

const API_URL = "/api/transactions";
const TRANSACTIONS_CACHE_PREFIX = "vani-ivy-transactions-cache";
const MONTHS_CACHE_KEY = "vani-ivy-months-cache";

let transactions = [];
let availableMonths = [];
let canMutateTransactions = false;
let editingTransactionKey = "";
let isLoadingTransactions = false;
let latestLoadRequestId = 0;

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

dateInput.valueAsDate = new Date();

amountInput.addEventListener('input', function (e) {
    const value = e.target.value.replace(/\D/g, '');
    e.target.value = value ? Number(value).toLocaleString('vi-VN') : '';
});

monthFilter.addEventListener('change', handleMonthChange);
submitBtn.addEventListener('click', saveItem);
cancelEditBtn.addEventListener('click', resetForm);

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

function getPayerClass(payer) {
    return String(payer).trim().toLowerCase() === 'ivy' ? 'ivy' : 'vani';
}

function formatPayerLabel(payer) {
    return String(payer || '').trim() || 'N/A';
}

function getScriptUrl() {
    return API_URL;
}

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCacheKey(monthKey) {
    return `${TRANSACTIONS_CACHE_PREFIX}-${monthKey}`;
}

function loadCachedTransactions(monthKey) {
    try {
        const cached = JSON.parse(localStorage.getItem(getCacheKey(monthKey)));
        if (!Array.isArray(cached)) return [];
        return cached;
    } catch (error) {
        return [];
    }
}

function saveCachedTransactions(monthKey, items) {
    localStorage.setItem(getCacheKey(monthKey), JSON.stringify(items));
}

function loadCachedMonths() {
    try {
        const cached = JSON.parse(localStorage.getItem(MONTHS_CACHE_KEY));
        if (!Array.isArray(cached)) return [];
        return cached;
    } catch (error) {
        return [];
    }
}

function saveCachedMonths(months) {
    localStorage.setItem(MONTHS_CACHE_KEY, JSON.stringify(months));
}

async function fetchTransactionsWithRetry(monthKey, attempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const url = new URL(getScriptUrl());
            url.searchParams.set('month', monthKey);
            url.searchParams.set('t', Date.now());

            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            return data;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }
    }

    throw lastError;
}

async function loadDataFromApi(selectedMonth = monthFilter.value || getCurrentMonthKey()) {
    const requestId = ++latestLoadRequestId;

    if (!availableMonths.length) {
        availableMonths = loadCachedMonths();
    }

    transactions = loadCachedTransactions(selectedMonth);

    isLoadingTransactions = true;
    generateMonthOptions(selectedMonth);
    renderData();

    try {
        const data = await fetchTransactionsWithRetry(selectedMonth);
        if (requestId !== latestLoadRequestId) return;

        transactions = Array.isArray(data) ? data : data.transactions || [];
        availableMonths = Array.isArray(data) ? [selectedMonth] : data.months || [];
        canMutateTransactions = !Array.isArray(data) && data.features?.mutations === true;
        saveCachedTransactions(selectedMonth, transactions);
        saveCachedMonths(availableMonths);
        setStatus("", "");

        generateMonthOptions(selectedMonth);
        renderData();
    } catch (error) {
        if (requestId !== latestLoadRequestId) return;

        console.error("Lỗi khi tải dữ liệu:", error);
        setStatus(
            transactions.length
                ? "Không tải được dữ liệu mới. Đang hiển thị dữ liệu gần nhất."
                : "Không tải được dữ liệu từ hệ thống lưu trữ.",
            "error"
        );
    } finally {
        if (requestId !== latestLoadRequestId) return;

        isLoadingTransactions = false;
        renderData();
    }
}

function generateMonthOptions(selectedMonth = monthFilter.value || getCurrentMonthKey()) {
    if (!monthFilter) return;

    const months = new Set();
    const currentMonth = getCurrentMonthKey();

    months.add(currentMonth);
    availableMonths.forEach(month => {
        if (month) months.add(month);
    });

    const sortedMonths = Array.from(months).sort().reverse();
    const selectedBefore = selectedMonth || currentMonth;

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

function handleMonthChange() {
    loadDataFromApi(monthFilter.value);
}

function getFormItem() {
    const item = {
        payer: payerInput.value,
        category: categoryInput.value,
        description: descriptionInput.value.trim(),
        amount: normalizeAmount(amountInput.value),
        date: dateInput.value.replace(/-/g, '/')
    };

    if (editingTransactionKey) {
        item.id = editingTransactionKey;
    }

    return item;
}

async function saveItem() {
    const item = getFormItem();
    const isEditing = Boolean(editingTransactionKey);

    if (!item.description || item.amount <= 0 || !dateInput.value) {
        setStatus("Vui lòng nhập đầy đủ thông tin.", "error");
        return;
    }

    if (isEditing && !canMutateTransactions) {
        setStatus("Cần bật backend mới trước khi sửa khoản chi.", "error");
        return;
    }

    submitBtn.innerText = isEditing ? "Đang cập nhật..." : "Đang gửi...";
    submitBtn.disabled = true;
    setStatus(isEditing ? "Đang cập nhật khoản chi..." : "Đang lưu khoản chi...");

    try {
        const response = await fetch(getScriptUrl(), {
            method: isEditing ? "PATCH" : "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(isEditing ? { key: editingTransactionKey, item } : item)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatus(isEditing ? "Đã cập nhật khoản chi." : "Đã ghi nhận khoản chi.", "success");
        resetForm();
        await loadDataFromApi(monthFilter.value || getMonthKey(item.date));
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
        setStatus("Cần bật backend mới trước khi sửa khoản chi.", "error");
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
        setStatus("Cần bật backend mới trước khi xóa khoản chi.", "error");
        return;
    }

    const item = findTransaction(key);
    if (!item) return;

    const confirmed = confirm(`Xóa khoản "${item.description}"?`);
    if (!confirmed) return;

    setStatus("Đang xóa khoản chi...");

    try {
        const response = await fetch(getScriptUrl(), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ key, item })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatus("Đã xóa khoản chi.", "success");
        if (editingTransactionKey === key) resetForm();
        await loadDataFromApi(monthFilter.value || getCurrentMonthKey());
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

    historyEmpty.textContent = isLoadingTransactions
        ? "Đang tải dữ liệu..."
        : "Chưa có khoản chi nào trong tháng này.";
    historyEmpty.style.display = !filteredData.length ? 'block' : 'none';
    transactionCount.innerText = isLoadingTransactions && !filteredData.length
        ? "Đang tải"
        : `${filteredData.length} khoản`;

    renderBudgetReport(filteredData);

    filteredData.slice().reverse().forEach(item => {
        const key = getTransactionKey(item);
        const amount = normalizeAmount(item.amount);
        const payerClass = getPayerClass(item.payer);
        const li = document.createElement('li');
        const details = document.createElement('div');
        const titleRow = document.createElement('div');
        const payerTag = createTextElement('span', formatPayerLabel(item.payer), `payer-tag ${payerClass}`);
        const separator = createTextElement('span', ' - ', 'transaction-separator');
        const title = createTextElement('span', item.description, 'transaction-title');
        const infoRow = document.createElement('div');
        const meta = createTextElement(
            'div',
            `${formatDisplayDate(item.date)} · ${item.category}`,
            'transaction-meta'
        );
        const side = document.createElement('div');
        const amountEl = createTextElement('span', formatCurrency(amount), 'amt');
        const actions = document.createElement('div');
        const editButton = createRowButton('Sửa', () => startEdit(key));
        const deleteButton = createRowButton('Xóa', () => deleteItem(key), 'danger');

        if (item.payer === 'Vani') totalVani += amount;
        else totalIvy += amount;

        li.className = `transaction-item ${payerClass}`;
        details.className = 'transaction-main';
        titleRow.className = 'transaction-title-row';
        infoRow.className = 'transaction-info-row';
        side.className = 'transaction-side';
        actions.className = 'transaction-actions';
        editButton.disabled = !canMutateTransactions;
        deleteButton.disabled = !canMutateTransactions;
        editButton.title = canMutateTransactions ? 'Sửa khoản chi' : 'Cần bật backend mới';
        deleteButton.title = canMutateTransactions ? 'Xóa khoản chi' : 'Cần bật backend mới';

        titleRow.append(payerTag, separator, title);
        infoRow.append(meta, amountEl);
        details.append(titleRow, infoRow);
        actions.append(editButton, deleteButton);
        side.append(actions);
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

    for (const category in CATEGORY_BUDGETS) {
        const budget = CATEGORY_BUDGETS[category];
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

loadDataFromApi();
