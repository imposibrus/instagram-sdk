
const CustomError = require('./lib/CustomError'),
    LoginError = CustomError('LoginError'),
    ThrottledError = CustomError('ThrottledError');

module.exports = {
    LoginError,
    ThrottledError
};
