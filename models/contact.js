const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const contactSchema = new Schema({
    _id: String,
    user: String,
    mobile_number: String,
    full_name: String,
    contact_image: String,
    last_seen: Date,
    create_date: Date
});

module.exports = mongoose.model('contacts', contactSchema);