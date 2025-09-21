const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    assigned_station: { type: String, ref: 'Station' },
    last_login: { type: Date },
    rank: { type: Number },
    code: { type: String }
}, { timestamps: true } )

module.exports = mongoose.model('User', userSchema)