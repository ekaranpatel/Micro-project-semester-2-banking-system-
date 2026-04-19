// Global state
let currentAccount = null;
let currentPin = null;

// Page Navigation
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(`${pageName}Page`).classList.add('active');
    
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find clicked button and mark active
    const clickedBtn = event?.target?.closest('.nav-btn');
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
    
    // Load data for specific pages
    if (pageName === 'home') {
        loadStats();
    } else if (pageName === 'search') {
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) resultsDiv.innerHTML = '';
    }
}

// Load Dashboard Stats
async function loadStats() {
    try {
        const result = await getStatsAPI();
        if (result && result.success) {
            const totalAccountsElem = document.getElementById('totalAccounts');
            const totalBalanceElem = document.getElementById('totalBalance');
            const todayTransactionsElem = document.getElementById('todayTransactions');
            
            if (totalAccountsElem) totalAccountsElem.textContent = result.data.totalAccounts || 0;
            if (totalBalanceElem) totalBalanceElem.textContent = `₹${(result.data.totalBalance || 0).toLocaleString()}`;
            if (todayTransactionsElem) todayTransactionsElem.textContent = result.data.todayTransactions || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Create Account
async function createAccount(event) {
    event.preventDefault();
    
    const accountData = {
        fullName: document.getElementById('fullName').value,
        phoneNumber: document.getElementById('phone').value,
        aadhaarNumber: document.getElementById('aadhaar').value,
        email: document.getElementById('email').value,
        pin: document.getElementById('pin').value,
        initialDeposit: parseFloat(document.getElementById('initialDeposit').value) || 0
    };
    
    const result = await createAccountAPI(accountData);
    const resultDiv = document.getElementById('createResult');
    
    if (result && result.success) {
        resultDiv.innerHTML = `
            <div class="success-message">
                <i class="fas fa-check-circle"></i>
                <strong>✅ Account Created Successfully!</strong><br>
                Account Number: <strong>${result.data.accountNumber}</strong><br>
                📝 Please save this number for future access.
            </div>
        `;
        document.getElementById('createAccountForm').reset();
        // Load updated stats
        loadStats();
    } else {
        const errorMsg = result?.error || 'Something went wrong';
        resultDiv.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                ❌ ${errorMsg}
            </div>
        `;
    }
    
    setTimeout(() => {
        if (resultDiv) resultDiv.innerHTML = '';
    }, 5000);
}

// Login
async function login() {
    const accountNumber = document.getElementById('loginAccNo').value;
    const pin = document.getElementById('loginPin').value;
    
    if (!accountNumber || !pin) {
        alert('⚠️ Please enter account number and PIN');
        return;
    }
    
    const result = await loginAPI(accountNumber, pin);
    
    if (result && result.success) {
        currentAccount = result.data;
        currentPin = pin;
        showDashboard();
    } else {
        alert('❌ Login failed: ' + (result?.error || 'Invalid credentials'));
    }
}

// Show Dashboard
function showDashboard() {
    const loginForm = document.getElementById('loginForm');
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (loginForm) loginForm.style.display = 'none';
    if (dashboardContent) dashboardContent.style.display = 'block';
    
    const dashName = document.getElementById('dashName');
    const dashAccNo = document.getElementById('dashAccNo');
    const dashBalance = document.getElementById('dashBalance');
    
    if (dashName) dashName.textContent = `Welcome, ${currentAccount.fullName}`;
    if (dashAccNo) dashAccNo.textContent = `Account: ${currentAccount.accountNumber}`;
    if (dashBalance) dashBalance.textContent = `₹${currentAccount.balance.toLocaleString()}`;
    
    loadTransactions();
}

// Load Transactions
async function loadTransactions() {
    const result = await getTransactionsAPI(currentAccount.accountNumber);
    
    if (result && result.success) {
        const transactions = result.data.transactions;
        const container = document.getElementById('transactionList');
        
        if (!container) return;
        
        if (transactions.length === 0) {
            container.innerHTML = '<div class="no-transactions">📭 No transactions yet</div>';
            return;
        }
        
        container.innerHTML = transactions.map(t => `
            <div class="transaction-item transaction-${t.type.toLowerCase()}">
                <div class="transaction-info">
                    <div class="transaction-type">
                        <i class="fas fa-${t.type === 'CREDIT' ? 'arrow-up' : 'arrow-down'}"></i>
                        ${t.type}
                    </div>
                    <div class="transaction-desc">${t.description || 'No description'}</div>
                    <div class="transaction-time">📅 ${new Date(t.timestamp).toLocaleString()}</div>
                </div>
                <div class="transaction-amount ${t.type.toLowerCase()}">
                    ${t.type === 'CREDIT' ? '+' : '-'} ₹${t.amount.toLocaleString()}
                </div>
                <div class="transaction-balance">💰 Balance: ₹${t.balanceAfter.toLocaleString()}</div>
            </div>
        `).join('');
    } else {
        console.error('Failed to load transactions:', result?.error);
    }
}

// Credit Money
async function creditMoney() {
    const amountInput = document.getElementById('creditAmount');
    const descInput = document.getElementById('creditDesc');
    
    const amount = parseFloat(amountInput?.value);
    const description = descInput?.value || '';
    
    if (!amount || amount <= 0) {
        alert('⚠️ Please enter a valid amount');
        return;
    }
    
    const result = await creditAPI(currentAccount.accountNumber, amount, description, currentPin);
    
    if (result && result.success) {
        alert(`✅ ₹${amount} credited successfully!`);
        currentAccount.balance = result.data.newBalance;
        const dashBalance = document.getElementById('dashBalance');
        if (dashBalance) dashBalance.textContent = `₹${currentAccount.balance.toLocaleString()}`;
        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
        loadTransactions();
        loadStats();
    } else {
        alert('❌ Error: ' + (result?.error || 'Transaction failed'));
    }
}

// Debit Money
async function debitMoney() {
    const amountInput = document.getElementById('debitAmount');
    const descInput = document.getElementById('debitDesc');
    
    const amount = parseFloat(amountInput?.value);
    const description = descInput?.value || '';
    
    if (!amount || amount <= 0) {
        alert('⚠️ Please enter a valid amount');
        return;
    }
    
    const result = await debitAPI(currentAccount.accountNumber, amount, description, currentPin);
    
    if (result && result.success) {
        alert(`✅ ₹${amount} debited successfully!`);
        currentAccount.balance = result.data.newBalance;
        const dashBalance = document.getElementById('dashBalance');
        if (dashBalance) dashBalance.textContent = `₹${currentAccount.balance.toLocaleString()}`;
        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
        loadTransactions();
        loadStats();
    } else {
        alert('❌ Error: ' + (result?.error || 'Insufficient balance or invalid transaction'));
    }
}

// Refresh Transactions
function refreshTransactions() {
    loadTransactions();
}

// Delete Account
async function deleteAccountPrompt() {
    const confirm = window.confirm('⚠️ WARNING: This action is IRREVERSIBLE!\n\nAre you sure you want to delete your account?');
    
    if (confirm) {
        const reason = prompt('Reason for deletion (optional):');
        const result = await deleteAccountAPI(currentAccount.accountNumber, currentPin, reason || '');
        
        if (result && result.success) {
            alert('✅ Account deleted successfully');
            logout();
        } else {
            alert('❌ Error: ' + (result?.error || 'Could not delete account'));
        }
    }
}

// Logout
function logout() {
    currentAccount = null;
    currentPin = null;
    
    const loginForm = document.getElementById('loginForm');
    const dashboardContent = document.getElementById('dashboardContent');
    const loginAccNo = document.getElementById('loginAccNo');
    const loginPin = document.getElementById('loginPin');
    
    if (loginForm) loginForm.style.display = 'block';
    if (dashboardContent) dashboardContent.style.display = 'none';
    if (loginAccNo) loginAccNo.value = '';
    if (loginPin) loginPin.value = '';
}

// Search Accounts
async function searchAccounts() {
    const query = document.getElementById('searchInput').value;
    
    if (!query) {
        alert('⚠️ Please enter search term');
        return;
    }
    
    const result = await searchAccountsAPI(query);
    const container = document.getElementById('searchResults');
    
    if (!container) return;
    
    if (result && result.success && result.data.accounts.length > 0) {
        container.innerHTML = `
            <div class="search-header">🔍 Found ${result.data.count} account(s)</div>
            ${result.data.accounts.map(acc => `
                <div class="search-result">
                    <div class="result-number">🏦 ${acc.accountNumber}</div>
                    <div class="result-name">👤 ${acc.fullName}</div>
                    <div class="result-phone">📞 ${acc.phoneNumber}</div>
                    <div class="result-balance">💰 ₹${acc.balance.toLocaleString()}</div>
                </div>
            `).join('')}
        `;
    } else {
        container.innerHTML = '<div class="no-results">🔍 No accounts found</div>';
    }
}

// Set current date in about page
function setCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Banking System Loaded!');
    loadStats();
    setCurrentDate();
    
    // Auto-refresh stats every 30 seconds
    setInterval(loadStats, 30000);
});

// Make functions global for HTML buttons
window.showPage = showPage;
window.createAccount = createAccount;
window.login = login;
window.creditMoney = creditMoney;
window.debitMoney = debitMoney;
window.refreshTransactions = refreshTransactions;
window.deleteAccountPrompt = deleteAccountPrompt;
window.logout = logout;
window.searchAccounts = searchAccounts;