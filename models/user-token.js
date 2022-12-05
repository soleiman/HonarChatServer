const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userTokenSchema = new Schema({
    user_id: { type: Schema.Types.String, required: true },
    token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    created_at: { type: Date, default: Date.now, expires: 30 * 86400 }, // 30 days
});

module.exports = mongoose.model("UserToken", userTokenSchema);