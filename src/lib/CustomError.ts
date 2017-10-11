
export default function CustomError(errorName: string): any {
    class MyCustomError extends Error {
        constructor(m?: string) {
            super(m);

            this.name = errorName;
            // Set the prototype explicitly.
            Object.setPrototypeOf(this, MyCustomError.prototype);
            Error.captureStackTrace(this, MyCustomError);
        }
    }

    return MyCustomError;
};
