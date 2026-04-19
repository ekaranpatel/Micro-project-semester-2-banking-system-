// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Helper function for API calls
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: 'Network error. Please check if server is running.' };
    }
}

// Account Management Functions
async function createAccountAPI(accountData) {
    return await apiCall('/accounts/create', 'POST', accountData);
}

async function loginAPI(accountNumber, pin) {
    return await apiCall('/accounts/login', 'POST', { accountNumber, pin });
}

async function creditAPI(accountNumber, amount, description, pin) {
    return await apiCall(`/accounts/${accountNumber}/credit`, 'POST', { amount, description, pin });
}

async function debitAPI(accountNumber, amount, description, pin) {
    return await apiCall(`/accounts/${accountNumber}/debit`, 'POST', { amount, description, pin });
}

async function getTransactionsAPI(accountNumber) {
    return await apiCall(`/accounts/${accountNumber}/transactions`);
}

async function deleteAccountAPI(accountNumber, pin, reason) {
    return await apiCall(`/accounts/${accountNumber}`, 'DELETE', { pin, reason });
}

async function getAllAccountsAPI() {
    return await apiCall('/accounts');
}

async function searchAccountsAPI(query) {
    return await apiCall(`/search?q=${encodeURIComponent(query)}`);
}

async function getStatsAPI() {
    return await apiCall('/stats');
}