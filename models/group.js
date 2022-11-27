const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const groupSchema = new Schema({
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    members: String,
    image: String,
    admins: String,
    created_by: String,
    created_at: Date
});

module.exports = mongoose.model('groups', groupSchema);