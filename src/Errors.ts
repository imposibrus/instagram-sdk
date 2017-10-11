
import CustomError from './lib/CustomError';

const LoginError = CustomError('LoginError'),
    ThrottledError = CustomError('ThrottledError');

export default {
    LoginError,
    ThrottledError,
};
