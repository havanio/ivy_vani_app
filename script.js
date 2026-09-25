const CATEGORY_BUDGETS = {
    "Ăn uống": 3600000,
    "Mèo": 500000,
    "Thiết yếu": 300000,
    "Cố định": 1700000,
    "Ăn ngoài": 1200000,
    "Khác": 1200000
};

const API_ORIGIN = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ||
    window.location.hostname.endsWith("github.io")
    ? "https://vanivy.netlify.app"
    : window.location.origin;
const API_URL = new URL("/api/transactions", API_ORIGIN).toString();
const TRANSACTIONS_CACHE_PREFIX = "vani-ivy-transactions-cache";
const MONTHS_CACHE_KEY = "vani-ivy-months-cache";

let transactions = [];
let availableMonths = [];
let canMutateTransactions = false;
let editingTransactionKey = "";
let isLoadingTransactions = false;
let latestLoadRequestId = 0;
let comparisonTransactions = [];
let comparisonLoaded = false;

const payerInput = document.getElementById('payer');
const categoryInput = document.getElementById('category');
const descriptionInput = document.getElementById('description');
const sourceInput = document.getElementById('source');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const monthFilter = document.getElementById('monthFilter');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');
const statusMessage = document.getElementById('statusMessage');
const historyEmpty = document.getElementById('historyEmpty');
const transactionCount = document.getElementById('transactionCount');
const viewTabs = document.querySelectorAll('.view-tab');
const comparisonPeriod = document.getElementById('comparisonPeriod');

dateInput.valueAsDate = new Date();

amountInput.addEventListener('input', function (e) {
    const value = e.target.value.replace(/\D/g, '');
    e.target.value = value ? Number(value).toLocaleString('vi-VN') : '';
});

monthFilter.addEventListener('change', handleMonthChange);
submitBtn.addEventListener('click', saveItem);
cancelEditBtn.addEventListener('click', resetForm);
viewTabs.forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
comparisonPeriod.addEventListener('change', renderComparison);

function switchView(view) {
    const isComparison = view === 'comparison';
    document.getElementById('overviewView').hidden = isComparison;
    document.getElementById('comparisonView').hidden = !isComparison;
    document.querySelector('.month-control').hidden = isComparison;
    viewTabs.forEach(tab => {
        const active = tab.dataset.view === view;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    if (isComparison && !comparisonLoaded) loadComparisonData();
}

async function loadComparisonData() {
    const status = document.getElementById('comparisonStatus');
    status.hidden = false;
    status.className = 'comparison-status';
    status.textContent = 'Đang tải dữ liệu so sánh...';

    try {
        const url = new URL(getScriptUrl(), window.location.origin);
        url.searchParams.set('t', Date.now());
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        comparisonTransactions = Array.isArray(data) ? data : data.transactions || [];
        comparisonLoaded = true;
        status.hidden = true;
        document.getElementById('comparisonContent').hidden = false;
        renderComparison();
    } catch (error) {
        console.error('Lỗi khi tải dữ liệu so sánh:', error);
        status.className = 'comparison-status error';
        status.textContent = 'Không tải được dữ liệu so sánh. Vui lòng thử lại sau.';
    }
}

function formatMonthShort(monthKey) {
    const [year, month] = monthKey.split('-');
    return `T${Number(month)}/${year}`;
}

function getMonthlyComparisonData() {
    const grouped = {};
    comparisonTransactions.forEach(item => {
        const month = getMonthKey(item.date);
        if (!month) return;
        if (!grouped[month]) grouped[month] = { total: 0, categories: {} };
        const amount = normalizeAmount(item.amount);
        grouped[month].total += amount;
        grouped[month].categories[item.category] = (grouped[month].categories[item.category] || 0) + amount;
    });
    const count = Number(comparisonPeriod.value) || 6;
    return Object.keys(grouped).sort().slice(-count).map(month => ({ month, ...grouped[month] }));
}

function formatChange(current, previous) {
    if (!previous) return current ? 'Mới' : '—';
    const percent = ((current - previous) / previous) * 100;
    if (Math.abs(percent) < 0.05) return '0%';
    return `${percent > 0 ? '+' : ''}${Math.round(percent)}%`;
}

function changeClass(current, previous) {
    if (current > previous) return 'change-up';
    if (current < previous) return 'change-down';
    return 'change-flat';
}

function renderComparison() {
    if (!comparisonLoaded) return;
    const months = getMonthlyComparisonData();
    const latest = months.at(-1);
    const previous = months.at(-2);
    if (!latest) {
        document.getElementById('comparisonContent').hidden = true;
        const status = document.getElementById('comparisonStatus');
        status.hidden = false;
        status.textContent = 'Chưa có dữ liệu để so sánh.';
        return;
    }

    document.getElementById('comparisonLatestTotal').textContent = formatCurrency(latest.total);
    document.getElementById('comparisonLatestLabel').textContent = formatMonthShort(latest.month);
    const changeEl = document.getElementById('comparisonChange');
    changeEl.textContent = previous ? formatChange(latest.total, previous.total) : '—';
    changeEl.className = previous ? changeClass(latest.total, previous.total) : '';
    document.getElementById('comparisonChangeHint').textContent = previous ? `so với ${formatMonthShort(previous.month)}` : 'Chưa đủ dữ liệu';
    const average = months.reduce((sum, item) => sum + item.total, 0) / months.length;
    document.getElementById('comparisonAverage').textContent = formatCurrency(average);
    document.getElementById('comparisonAverageHint').textContent = `Trong ${months.length} tháng có dữ liệu`;

    const maxTotal = Math.max(...months.map(item => item.total), 1);
    const chart = document.getElementById('trendChart');
    chart.innerHTML = months.map(item => `
        <div class="trend-column">
            <div class="trend-bar-wrap"><div class="trend-bar" style="height:${Math.max((item.total / maxTotal) * 100, 4)}%" title="${formatCurrency(item.total)}"></div></div>
            <span class="trend-value">${(item.total / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>
            <span class="trend-label">${formatMonthShort(item.month)}</span>
        </div>
    `).join('');

    const categories = Object.keys(CATEGORY_BUDGETS);
    document.getElementById('comparisonTableHead').innerHTML = `<tr><th>Danh mục</th><th>Định mức</th>${months.map(item => `<th>${formatMonthShort(item.month)}</th>`).join('')}<th>So với định mức</th></tr>`;
    const rows = categories.map(category => {
        const values = months.map(item => item.categories[category] || 0);
        const current = values.at(-1) || 0;
        const budget = CATEGORY_BUDGETS[category] || 0;
        const valueCells = values.map(value => {
            const isOverBudget = budget > 0 && value > budget;
            const overAmount = value - budget;
            const warning = isOverBudget
                ? `<span class="budget-warning" aria-label="Vượt định mức ${formatCurrency(overAmount)}" title="Vượt định mức ${formatCurrency(overAmount)}">⚠</span>`
                : '';
            return `<td class="${isOverBudget ? 'over-budget' : ''}">${formatCurrency(value)}${warning}</td>`;
        }).join('');
        return `<tr><td>${category}</td><td class="budget-limit">${budget ? formatCurrency(budget) : '—'}</td>${valueCells}<td class="${changeClass(current, budget)}">${budget ? formatChange(current, budget) : '—'}</td></tr>`;
    });
    const totalValues = months.map(item => item.total);
    const totalBudget = Object.values(CATEGORY_BUDGETS).reduce((sum, value) => sum + value, 0);
    rows.push(`<tr class="total-row"><td>Tổng chi</td><td>${formatCurrency(totalBudget)}</td>${totalValues.map(value => `<td>${formatCurrency(value)}</td>`).join('')}<td class="${changeClass(latest.total, totalBudget)}">${formatChange(latest.total, totalBudget)}</td></tr>`);
    document.getElementById('comparisonTableBody').innerHTML = rows.join('');
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

function getPayerClass(payer) {
    return String(payer).trim().toLowerCase() === 'ivy' ? 'ivy' : 'vani';
}

function formatPayerLabel(payer) {
    return String(payer || '').trim() || 'N/A';
}

function formatTransactionMeta(item) {
    return [
        formatDisplayDate(item.date),
        item.category,
        item.source
    ].filter(Boolean).join(' · ');
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
            const url = new URL(getScriptUrl(), window.location.origin);
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
        source: sourceInput.value,
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
    sourceInput.value = item.source || "";
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
    sourceInput.value = '';
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

    filteredData.forEach(item => {
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
            formatTransactionMeta(item),
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
    renderMonthlyInsights(totalVani + totalIvy);

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

function renderMonthlyInsights(totalSpent) {
    const totalBudget = Object.values(CATEGORY_BUDGETS).reduce((sum, value) => sum + value, 0);
    const remaining = totalBudget - totalSpent;
    const remainingEl = document.getElementById('remainingBudget');
    const paceEl = document.getElementById('spendingPace');
    const forecastEl = document.getElementById('monthForecast');
    const selectedMonth = monthFilter.value || getCurrentMonthKey();
    const [year, month] = selectedMonth.split('-').map(Number);
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const selectedEnd = new Date(year, month, 0);
    const isPastMonth = selectedEnd < new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = selectedEnd.getDate();
    const elapsedDays = isCurrentMonth ? now.getDate() : (isPastMonth ? daysInMonth : 0);
    const elapsedPercent = daysInMonth ? (elapsedDays / daysInMonth) * 100 : 0;
    const budgetPercent = totalBudget ? (totalSpent / totalBudget) * 100 : 0;
    const forecast = isCurrentMonth && elapsedDays > 0
        ? (totalSpent / elapsedDays) * daysInMonth
        : totalSpent;
    const paceDifference = budgetPercent - elapsedPercent;

    remainingEl.textContent = formatCurrency(Math.abs(remaining));
    remainingEl.className = remaining < 0 ? 'metric-danger' : 'metric-good';
    document.getElementById('remainingBudgetHint').textContent = remaining < 0
        ? `Đã vượt ${formatCurrency(Math.abs(remaining))}`
        : `Trên tổng ${formatCurrency(totalBudget)}`;

    paceEl.textContent = `${Math.round(budgetPercent)}%`;
    paceEl.className = paceDifference > 5 ? 'metric-danger' : 'metric-good';
    document.getElementById('spendingPaceHint').textContent = isCurrentMonth
        ? (paceDifference > 5
            ? `Nhanh hơn tiến độ ${Math.round(paceDifference)} điểm %`
            : `Đã qua ${Math.round(elapsedPercent)}% số ngày`)
        : (isPastMonth ? 'Mức sử dụng ngân sách' : 'Tháng chưa bắt đầu');

    forecastEl.textContent = formatCurrency(forecast);
    forecastEl.className = forecast > totalBudget ? 'metric-danger' : 'metric-good';
    document.getElementById('monthForecastHint').textContent = isCurrentMonth
        ? (forecast > totalBudget
            ? `Có thể vượt ${formatCurrency(forecast - totalBudget)}`
            : `Dự kiến còn ${formatCurrency(totalBudget - forecast)}`)
        : (isPastMonth ? 'Số thực tế cuối tháng' : 'Chưa có dự báo');
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
