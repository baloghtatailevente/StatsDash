require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Payment = require('./models/Payment');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
    res.sendFile(__dirname + "/public/index.html")
})

// Routes
// GET all payments
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 });
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new payment
app.post('/api/payments', async (req, res) => {
    try {
        const { name, guests, amount, table } = req.body;
        const newPayment = new Payment({ name, guests, amount, table });
        await newPayment.save();
        res.status(201).json(newPayment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update payment
app.put('/api/payments/:id', async (req, res) => {
    try {
        const updatedPayment = await Payment.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedPayment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE payment
app.delete('/api/payments/:id', async (req, res) => {
    try {
        await Payment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Payment deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/payments/:id', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
