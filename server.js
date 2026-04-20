 const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();
// --- TWILIO SMS SETUP ---
const twilio = require('twilio');
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

async function sendSMS(phone, message) {
    if (!twilioClient) return; // Skip if Twilio isn't set up yet
    try {
        // Automatically add +91 for Indian numbers if it's missing
        const formattedPhone = phone.startsWith('+') ? phone : '+91' + phone;
        await twilioClient.messages.create({
            body: message,
            to: formattedPhone,
            from: process.env.TWILIO_PHONE_NUMBER
        });
        console.log(`📱 SMS successfully sent to ${formattedPhone}`);
    } catch (error) {
        console.error('❌ Twilio SMS Error:', error.message);
    }
}
// ------------------------
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ================= MODELS =================

// 1. Transaction Schema
const transactionSchema = new mongoose.Schema({
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
});

// 2. Account Schema
const accountSchema = new mongoose.Schema({
    accountNumber: { type: String, unique: true, required: true },
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true },
    aadhaarNumber: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    balance: { type: Number, default: 0 },
    pin: { type: String, required: true },
    transactions: [transactionSchema],
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

const Account = mongoose.model('Account', accountSchema);

// 3. Enquiry Schema
const enquirySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'Unread' }
});

const Enquiry = mongoose.model('Enquiry', enquirySchema);

// Helper
function generateAccountNumber() {
    return 'ACC' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
}

// ================= API ROUTES =================

// Submit Enquiry
app.post('/api/enquiries', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        
        if (!name || !email || !message) {
            return res.status(400).json({ success: false, error: 'Name, email, and message are required' });
        }
        
        const newEnquiry = new Enquiry({ name, email, phone, message });
        await newEnquiry.save();
        
        res.status(201).json({ success: true, message: 'Enquiry saved to MongoDB!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create Account
app.post('/api/accounts/create', async (req, res) => {
    try {
        const { fullName, phoneNumber, aadhaarNumber, email, initialDeposit, pin } = req.body;
        
        if (!fullName || !phoneNumber || !aadhaarNumber || !email || !pin) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        
        const accountNumber = generateAccountNumber();
        const account = new Account({
            accountNumber, fullName, phoneNumber, aadhaarNumber, email,
            balance: initialDeposit || 0, pin
        });
        
        if (initialDeposit > 0) {
            account.transactions.push({
                type: 'CREDIT',
                amount: initialDeposit,
                balanceAfter: initialDeposit,
                description: 'Initial deposit'
            });
        }
        
        await account.save();
        res.json({ success: true, message: 'Account created!', data: { accountNumber, fullName, balance: account.balance } });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ success: false, error: 'Phone or Aadhaar already registered' });
        res.status(400).json({ success: false, error: error.message });
    }
});

// Login
app.post('/api/accounts/login', async (req, res) => {
    try {
        const { accountNumber, pin } = req.body;
        const account = await Account.findOne({ accountNumber, isActive: true });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
        if (account.pin !== pin) return res.status(401).json({ success: false, error: 'Invalid PIN' });
        res.json({ success: true, data: account });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Credit
 // Credit
app.post('/api/accounts/:accountNumber/credit', async (req, res) => {
    try {
        const { amount, description, pin } = req.body;
        const account = await Account.findOne({ accountNumber: req.params.accountNumber, isActive: true });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
        if (account.pin !== pin) return res.status(401).json({ success: false, error: 'Invalid PIN' });
        
        account.balance += amount;
        account.transactions.push({ type: 'CREDIT', amount, balanceAfter: account.balance, description });
        await account.save();
        
        // 📱 SEND SMS ALERT
        sendSMS(account.phoneNumber, `MITS Bank Alert: Rs. ${amount} credited to A/C ending in ${account.accountNumber.slice(-4)}. Available Bal: Rs. ${account.balance}`);

        res.json({ success: true, message: 'Amount credited!', data: { newBalance: account.balance } });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Debit
  // Debit
app.post('/api/accounts/:accountNumber/debit', async (req, res) => {
    try {
        const { amount, description, pin } = req.body;
        const account = await Account.findOne({ accountNumber: req.params.accountNumber, isActive: true });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
        if (account.pin !== pin) return res.status(401).json({ success: false, error: 'Invalid PIN' });
        if (amount > account.balance) return res.status(400).json({ success: false, error: 'Insufficient balance' });
        
        account.balance -= amount;
        account.transactions.push({ type: 'DEBIT', amount, balanceAfter: account.balance, description });
        await account.save();
        
        // 📱 SEND SMS ALERT
        sendSMS(account.phoneNumber, `MITS Bank Alert: Rs. ${amount} debited from A/C ending in ${account.accountNumber.slice(-4)}. Available Bal: Rs. ${account.balance}`);

        res.json({ success: true, message: 'Amount debited!', data: { newBalance: account.balance } });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Transfer Funds (P2P)
 // Transfer Funds (P2P)
 
app.post('/api/accounts/:accountNumber/transfer', async (req, res) => {
    try {
        const { receiverAccountNo, amount, pin } = req.body;
        const senderAccountNo = req.params.accountNumber;

        if (!receiverAccountNo || !amount) return res.status(400).json({ success: false, error: 'All fields are required' });
        if (amount <= 0) return res.status(400).json({ success: false, error: 'Invalid transfer amount' });
        if (senderAccountNo === receiverAccountNo) return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });

        const sender = await Account.findOne({ accountNumber: senderAccountNo, isActive: true });
        if (!sender) return res.status(404).json({ success: false, error: 'Sender account not found' });
        if (sender.pin !== pin) return res.status(401).json({ success: false, error: 'Invalid Security PIN' });
        if (sender.balance < amount) return res.status(400).json({ success: false, error: 'Insufficient funds! Deposit money first.' });

        const receiver = await Account.findOne({ accountNumber: receiverAccountNo, isActive: true });
        if (!receiver) return res.status(404).json({ success: false, error: 'Receiver Account Number not found in database' });

        sender.balance -= amount;
        sender.transactions.push({ type: 'DEBIT', amount, balanceAfter: sender.balance, description: `Transfer to ${receiver.fullName} (${receiver.accountNumber})` });

        receiver.balance += amount;
        receiver.transactions.push({ type: 'CREDIT', amount, balanceAfter: receiver.balance, description: `Transfer from ${sender.fullName} (${sender.accountNumber})` });

        await sender.save();
        await receiver.save();

        // 📱 SEND SMS ALERTS TO BOTH PARTIES
        sendSMS(sender.phoneNumber, `MITS Bank Alert: Rs. ${amount} transferred to ${receiver.fullName}. Available Bal: Rs. ${sender.balance}`);
        sendSMS(receiver.phoneNumber, `MITS Bank Alert: Rs. ${amount} received from ${sender.fullName}. Available Bal: Rs. ${receiver.balance}`);

        res.json({ success: true, message: 'Transfer successful!', data: { newBalance: sender.balance } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// Get Transactions
app.get('/api/accounts/:accountNumber/transactions', async (req, res) => {
    try {
        const account = await Account.findOne({ accountNumber: req.params.accountNumber, isActive: true });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
        
        const transactions = [...account.transactions].reverse();
        res.json({ success: true, data: { transactions, currentBalance: account.balance } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Account
app.delete('/api/accounts/:accountNumber', async (req, res) => {
    try {
        const { pin } = req.body;
        const account = await Account.findOne({ accountNumber: req.params.accountNumber, isActive: true });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
        if (account.pin !== pin) return res.status(401).json({ success: false, error: 'Invalid PIN' });
        
        account.isActive = false;
        await account.save();
        
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get All Accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find({ isActive: true });
        res.json({ success: true, data: { accounts } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalAccounts = await Account.countDocuments({ isActive: true });
        const accounts = await Account.find({ isActive: true });
        const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
        res.json({ success: true, data: { totalAccounts, totalBalance } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve frontend
 // Serve frontend static files from the exact same directory
app.use(express.static(__dirname));

// Point all routes to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error("❌ File Error:", err);
            res.status(500).send("MITS Bank Error: Could not load index.html");
        }
    });
});
