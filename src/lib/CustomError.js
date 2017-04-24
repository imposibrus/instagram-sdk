
module.exports = function CustomError(errorName) {
    function MyCustomError(message) {
        this.message = message;
        this.name = errorName;
        Error.captureStackTrace(this, MyCustomError);
    }
    MyCustomError.prototype = Object.create(Error.prototype);
    MyCustomError.prototype.constructor = MyCustomError;

    return MyCustomError;
};
