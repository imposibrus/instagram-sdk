
import * as util from 'util';
import * as _ from 'lodash';
import * as tough from 'tough-cookie';
import * as got from 'got';
import * as tunnel from 'tunnel';
import Constants from './Constants';
import Signatures from './Signatures';
import Errors from './Errors';
import _logger from './lib/logger';

const Cookie = tough.Cookie,
    logger = _logger.getLogger('instagram-sdk:Request');

export default class Request {
    private static _normalizeQueryParams(query: object) {
        const out = {};

        for (const i in query) {
            if (Object.prototype.hasOwnProperty.call(query, i)) {
                if (query[i] !== undefined && query[i] !== null) {
                    out[i] = query[i];
                }
            }
        }

        return out;
    }

    public requestId: string = Signatures.generateUUID();
    public method = 'GET';
    public body = {};
    public query = {};
    public headers = {
        'Connection': 'keep-alive',
        'Accept': '*/*',
        'Accept-Encoding': Constants.ACCEPT_ENCODING,
        'X-IG-Capabilities': Constants.X_IG_Capabilities,
        'X-IG-Connection-Type': Constants.X_IG_Connection_Type,
        'X-IG-Connection-Speed': _.random(1000, 3700) + 'kbps',
        'X-FB-HTTP-Engine': Constants.X_FB_HTTP_Engine,
        'Content-Type': Constants.CONTENT_TYPE,
        'Accept-Language': Constants.ACCEPT_LANGUAGE,
    };
    public defaultRequestOptions = {
        timeout: 5000,
        // gzip: true,
    };
    public defaultRequestOptions2 = {
        decompress: true,
        followRedirect: true,
    };
    public checkStatusCode = false;
    public successStatusCodes = new Set([200, 204]);
    public repeatOnTooManyRequestsInterval = 0;
    public parseResponseInJSON = true;
    public reloginOnError = true;
    public url: string;
    public cachedSendPromise: Promise<any>;
    public logger: IntelLoggerInstance;

    constructor(public ig: any, url: string) {
        this.url = Constants.API_URL + url;
        this.logger = logger.setLevel(this.ig.logLevel);

        this.headers['User-Agent'] = this.ig.userAgent;
        // this.defaultRequestOptions.jar = this.ig.jar;
        // this.defaultRequestOptions.baseUrl = Constants.API_URL;
    }

    public setReloginOnError(relogin: boolean) {
        this.reloginOnError = relogin;

        return this;
    }

    public setParseResponseInJSON(parse: boolean) {
        this.parseResponseInJSON = parse;

        return this;
    }

    public setSuccessStatusCodes(codes: number[]) {
        this.successStatusCodes = new Set(codes);

        return this;
    }

    public setCheckStatusCode(check: boolean) {
        this.checkStatusCode = check;

        return this;
    }

    public setMethod(method: string) {
        this.method = method;

        return this;
    }

    public setBody(body: any) {
        this.body = body;

        return this;
    }

    public setQuery(query: any) {
        this.query = query;

        return this;
    }

    public setHeaders(headers: any) {
        this.headers = headers;

        return this;
    }

    public addBodyParam(key: string, value: string) {
        this.body[key] = value;

        return this;
    }

    public addQueryParam(key: string, value: string) {
        this.query[key] = value;

        return this;
    }

    public addHeader(key: string, value: string) {
        this.headers[key] = value;

        return this;
    }

    public then(...args: any[]) {
        this.cachedSendPromise = this.cachedSendPromise || this.send();

        return this.cachedSendPromise.then(...arguments);
    }

    public catch(...args: any[]) {
        this.cachedSendPromise = this.cachedSendPromise || this.send();

        return this.cachedSendPromise.catch(...arguments);
    }

    public async send() {
        const options: any = Object.assign({}, this.defaultRequestOptions2, {
                method: this.method,
                headers: Object.assign({}, this.headers, {
                    cookie: await util.promisify(this.ig.jar.getCookieString.bind(this.ig.jar))(this.url),
                }),
                json: true,
                query: Request._normalizeQueryParams(this.query),
            });

        if (this.ig.proxy) {
            options.agent = tunnel.httpOverHttp({
                proxy: {
                    host: this.ig.proxy.ip,
                    port: this.ig.proxy.port,
                    headers: {},
                },
            });
            this.logger.debug(`(${this.requestId}) Request.send: using proxy:`, this.ig.proxy);
        }
        
        if (!_.isEmpty(this.body)) {
            options.body = /*JSON.stringify(*/this.body/*)*/;
            options.form = true;
            this.logger.debug(`(${this.requestId}) Request.send: request with body: %:2j`, this.body);
        }

        this.logger.debug(`(${this.requestId}) Request.send: request to %s with params: %:2j`, this.url, options);

        return got(this.url, options).catch((err) => {
            if (err instanceof (got as any).HTTPError) {
                if (this.checkStatusCode && !this.successStatusCodes.has(err.statusCode)) {
                    if (err.statusCode === 429) {
                        const error: any = new Errors.ThrottledError();

                        error.res = err.response;

                        throw error;
                    }

                } else {
                    this.logger.debug(err);

                    return Promise.resolve(err.response);
                }
            }

            err.res = {requestId: this.requestId};

            throw err;
        }).then(async (res) => {
            (res as any).requestId = this.requestId;

            this.logger.debug(`(${this.requestId}) Request.send: response statusCode:`, res.statusCode);
            this.logger.debug(`(${this.requestId}) Request.send: response headers:`, res.headers);

            let cookies;

            if (Array.isArray(res.headers['set-cookie'])) {
                cookies = (res.headers['set-cookie'] as string[]).map((str) => Cookie.parse(str));
            } else {
                cookies = [Cookie.parse(res.headers['set-cookie'] as string)];
            }

            const setCookie = util.promisify(this.ig.jar.setCookie.bind(this.ig.jar));

            for (const cookie of cookies) {
                await setCookie(cookie, this.url);
            }

            await this.ig.extractCSRFToken({res});

            if (this.repeatOnTooManyRequestsInterval && res.statusCode === 429) {
                return setTimeout(this.send.bind(this), this.repeatOnTooManyRequestsInterval);
            }

            if (this.reloginOnError && (res.body as any).message === 'login_required') {
                this.logger.debug(
                    `(${this.requestId}) Request.send: 'login_required', try again:`,
                    res.body,
                );

                return this.ig.login(true).then(() => {
                    return this.send();
                });
            }

            this.logger.debug(
                `(${this.requestId}) Request.send parsing JSON: response: %.-500s`,
                util.inspect(res.body),
            );

            if (res.body) {
                (res.body as any).requestId = this.requestId;
            }

            return Promise.resolve(res.body);
        });
    }
}
