const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const userSchema = new Schema({
    _id: String,
    mobile_number: String,
    password: String,
    full_name: String,
    profile_image: String
});

module.exports = mongoose.model('users', userSchema);