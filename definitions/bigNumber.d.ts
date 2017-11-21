
type bigNumberNumber = string | number | number[] | BigNumber | void;

interface BigNumber {
    number: number[] | string;
    sign: -1 | 1;
    rest: number | BigNumber;

    // tslint:disable-next-line:no-misused-new
    new (initialNumber: bigNumberNumber): this;

    addDigit(digit: number): boolean | BigNumber;

    _compare(num: bigNumberNumber): 0 | -1 | 1;

    gt(num: bigNumberNumber): boolean;
    gte(num: bigNumberNumber): boolean;

    equals(num: bigNumberNumber): boolean;

    lte(num: bigNumberNumber): boolean;
    lt(num: bigNumberNumber): boolean;

    add(num: bigNumberNumber): this;
    plus(num: bigNumberNumber): this;
    subtract(num: bigNumberNumber): this;
    minus(num: bigNumberNumber): this;

    _add(a: BigNumber, b: BigNumber): number[];
    _subtract(a: BigNumber, b: BigNumber): number[];

    multiply(num: bigNumberNumber): this;
    mult(num: bigNumberNumber): this;
    divide(num: bigNumberNumber): this;
    div(num: bigNumberNumber): this;

    mod(num: bigNumberNumber): number | string;
    power(num: bigNumberNumber): this;
    pow(num: bigNumberNumber): this;
    abs(): BigNumber;

    isZero(): boolean;
    toString(): string;
    val(): string;
}

declare module 'big-number' {
    export = bigNumber;
}

declare var bigNumber: BigNumber;
