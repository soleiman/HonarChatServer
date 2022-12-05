const jwt = require("jsonwebtoken");

const secret_key = process.env.TOKENSECRETKEY || 'r56$#$4#$dr66EUH3&*$%';

const verifyToken = async (req, res, next) => {
    const token = req.body.token || req.query.token || req.headers["x-access-token"];

    if (!token) {
        return res.status(403).send("دسترسی غیر مجاز");
    }

    try {
        const decoded = await jwt.verify(token, secret_key);
        req.user = decoded;
    } catch (err) {
        return res.status(401).send("توکن معتبر نیست");
    }

    return next();
};

const verify_token = async (token) => {
    console.log(`[verify_token]: ${token}`);
    if (!token) {
        return false;
    }

    try {
        await jwt.verify(token, secret_key);
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = { verifyToken, verify_token };