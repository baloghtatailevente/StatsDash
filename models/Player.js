const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true },
    class: { type: String, required: true },
    last_station: { type: String },
    points: { type: Number, default: 0 }
}, { timestamps: true } )

module.exports = mongoose.model('Player', playerSchema)