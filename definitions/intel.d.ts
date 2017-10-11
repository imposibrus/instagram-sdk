
interface IntelInterface extends IntelLoggerInstance {
    INFO: string;
    basicConfig(options: any): IntelLoggerInstance;
    getLogger(loggerName?: string): IntelLoggerInstance;
}

interface IntelLoggerInstance {
    critical(...args: any[]): any;
    debug(...args: any[]): any;
    setLevel(level: string): IntelLoggerInstance;
}

declare module 'intel' {
    export = intel;
}

declare var intel: IntelInterface;
