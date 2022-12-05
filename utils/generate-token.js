const UserToken = require("../models/user-token");
const jwt = require('jsonwebtoken');

const tokenExpireIn = process.env.TOKENEXPIREIN || "1h";
const refreshTokenExpireIn = process.env.REFRESHTOKENEXPIREIN || "1h";
const secret_key = process.env.TOKENSECRETKEY || 'r56$#$4#$dr66EUH3&*$%';

const generateTokens = async (user) => {
    try {
        const payload = { user_id: user._id };

        const accessToken = jwt.sign(
            payload,
            secret_key,
            { expiresIn: tokenExpireIn }
        );
        
        const refreshToken = jwt.sign(
            payload,
            secret_key,
            { expiresIn: refreshTokenExpireIn }
        );

        await UserToken.collection.findOneAndDelete({ 'user_id': user._id });
        
        await UserToken.collection.insertOne({ user_id: user._id, token: accessToken, refresh_token: refreshToken });
        
        return Promise.resolve({ accessToken, refreshToken });
    } catch (err) {
        return Promise.reject(err);
    }
};

module.exports = generateTokens;