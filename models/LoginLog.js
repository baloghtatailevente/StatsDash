const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
    success: { type: Boolean, default: true },
    ip: { type: String }
});

module.exports = mongoose.model('LoginLog', loginLogSchema);
