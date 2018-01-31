
import * as winston from 'winston';

export default class Logger {
    public static getLogger(label: string, options?: winston.ConsoleTransportOptions): winston.LoggerInstance {
        if (winston.loggers.has(label)) {
            return winston.loggers.get(label);
        }

        return winston.loggers.add(label, {
            console: Object.assign({}, {
                label,
                prettyPrint: true,
                timestamp: true,
                level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
            }, options),
        });
    }
}
