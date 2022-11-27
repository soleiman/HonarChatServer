const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const messageSchema = new Schema({
    _id: mongoose.Schema.Types.ObjectId,
    body: String,
    date: Date,
    sender: String,
    status: Number,
    recvId: String,
    recvIsGroup: Boolean
});

module.exports = mongoose.model('messages', messageSchema);