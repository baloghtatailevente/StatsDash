const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    guests: { type: Number, required: true },
    amount: { type: Number, required: true },
    table: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);
