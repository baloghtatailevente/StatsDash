const mongoose = require('mongoose');

const stationSchema = new mongoose.Schema({
    name: { type: String },
    number: { type: String },
    max_points: { type: Number },
    image: { type: String, default: "https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png" }
});

module.exports = mongoose.model('Station', stationSchema);
