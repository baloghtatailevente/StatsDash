const mongoose = require("mongoose");

const PointLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: "Station", required: true },
  points: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  description: { type: String } // optional, e.g. "Bonus points", "Win at station 3"
});

module.exports = mongoose.model("PointLog", PointLogSchema);