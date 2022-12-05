const UserToken = require("../models/user-token");
const jwt = require('jsonwebtoken');

const verifyRefreshToken = async (refreshToken) => {
    const secret_key = process.env.TOKENSECRETKEY || 'r56$#$4#$dr66EUH3&*$%';

    let user = await UserToken.collection.findOne({ 'refresh_token': refreshToken });

    if (!user)
        return false;

    try {
        const decoded = await jwt.verify(refreshToken, secret_key);
        console.log("[REF TOKEN DETAILS]:", decoded);
        return true;
    } catch (err) {
        console.log("[REF TOKEN ERR]:", err);
        return false;
    }
};

module.exports = verifyRefreshToken;