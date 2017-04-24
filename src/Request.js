
const util = require('util'),
    _ = require('lodash'),
    request = require('request'),
    Constants = require('./Constants'),
    Signatures = require('./Signatures'),
    Errors = require('./Errors'),
    logger = require('./lib/logger').getLogger('instagram-sdk:Request');

class Request {
    requestId;
    method = 'GET';
    body = {};
    query = {};
    headers = {
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
    defaultRequestOptions = {
        timeout: 5000,
        gzip: true,
    };
    checkStatusCode = false;
    successStatusCodes = new Set([200, 204]);
    repeatOnTooManyRequestsInterval = 0;
    parseResponseInJSON = true;
    reloginOnError = true;
    ig;
    url;
    cachedSendPromise;

    constructor(ig, url) {
        this.ig = ig;
        this.url = url;
        this.requestId = Signatures.generateUUID();
        this.logger = logger.setLevel(this.ig.logLevel);

        this.headers['User-Agent'] = this.ig.userAgent;
        this.defaultRequestOptions['jar'] = this.ig.jar;
        this.defaultRequestOptions['baseUrl'] = Constants.API_URL;
    }

    setReloginOnError(relogin) {
        this.reloginOnError = relogin;

        return this;
    }

    setParseResponseInJSON(parse) {
        this.parseResponseInJSON = parse;

        return this;
    }

    setSuccessStatusCodes(codes) {
        this.successStatusCodes = new Set(codes);

        return this;
    }

    setCheckStatusCode(check) {
        this.checkStatusCode = check;

        return this;
    }

    setMethod(method) {
        this.method = method;

        return this;
    }

    setBody(body) {
        this.body = body;

        return this;
    }

    setQuery(query) {
        this.query = query;

        return this;
    }

    setHeaders(headers) {
        this.headers = headers;

        return this;
    }

    addBodyParam(key, value) {
        this.body[key] = value;

        return this;
    }

    addQueryParam(key, value) {
        this.query[key] = value;

        return this;
    }

    addHeader(key, value) {
        this.headers[key] = value;

        return this;
    }

    then() {
        this.cachedSendPromise = this.cachedSendPromise || this.send();

        return this.cachedSendPromise.then(...arguments);
    }

    catch() {
        this.cachedSendPromise = this.cachedSendPromise || this.send();

        return this.cachedSendPromise.catch(...arguments);
    }

    send() {
        const requestOptions = Object.assign({}, this.defaultRequestOptions, {
            url: this.url,
            qs: Request._normalizeQueryParams(this.query),
            method: this.method,
        });

        return new Promise((resolve, reject) => {
            if (this.ig.proxy) {
                requestOptions.proxy = `http://${this.ig.proxy.ip}:${this.ig.proxy.port}`;
                this.logger.debug(`(${this.requestId}) Request.send: using proxy: ${requestOptions.proxy}`);
            }

            if (!_.isEmpty(this.body)) {
                requestOptions.form = this.body;
                this.logger.debug(`(${this.requestId}) Request.send: request with body: %:2j`, this.body);
            }

            requestOptions.headers = this.headers;
            this.logger.debug(`(${this.requestId}) Request.send: request with params: %:2j`, _.omit(requestOptions, ['jar']));

            const requester = request[this.method.toLowerCase()];

            requester(requestOptions, (err, res, resData) => {
                if (err) {
                    err.res = {requestId: this.requestId};

                    return reject(err);
                }

                res.requestId = this.requestId;

                this.logger.debug(`(${this.requestId}) Request.send: response statusCode:`, res.statusCode);
                this.logger.debug(`(${this.requestId}) Request.send: response headers:`, res.headers);

                this.ig.extractCSRFToken({res});

                if (this.repeatOnTooManyRequestsInterval && res.statusCode === 429) {
                    return setTimeout(this.send.bind(this), this.repeatOnTooManyRequestsInterval);
                }

                if (this.checkStatusCode && !this.successStatusCodes.has(res.statusCode)) {
                    if (res.statusCode === 429) {
                        let err = new Errors.ThrottledError();

                        err.resData = resData;
                        err.res = res;

                        throw err;
                    }

                    let err = new Error();

                    err.resData = resData;
                    err.res = res;

                    throw err;
                }

                if (this.parseResponseInJSON) {
                    let resJSON = {};

                    if(res.statusCode === 204) {
                        this.logger.debug(`(${this.requestId}) Request.send parsing JSON: empty response`);

                        return resolve({});
                    }

                    try {
                        resJSON = JSON.parse(resData);
                    } catch(err) {
                        this.logger.debug(`(${this.requestId}) Request.send parsing JSON: invalid response:`, resData);

                        let err = new Error('Invalid JSON response:' + resData);

                        err.resData = resData;
                        err.res = res;

                        return reject(err);
                    }

                    if(this.reloginOnError && resJSON.message === 'login_required') {
                        this.logger.debug(`(${this.requestId}) Request.send parsing JSON: 'login_required', try again:`, resJSON);

                        return this.ig.login(true).then(() => {
                            return this.send();
                        });
                    }

                    this.logger.debug(`(${this.requestId}) Request.send parsing JSON: response: %.-500s`, util.inspect(resJSON));

                    resJSON.requestId = this.requestId;

                    return resolve(resJSON);
                }

                resolve({res, resData});
            });
        });
    }

    static _normalizeQueryParams(query) {
        let out = {};

        for (let i in query) {
            if (Object.prototype.hasOwnProperty.call(query, i)) {
                if (query[i] !== undefined && query[i] !== null) {
                    out[i] = query[i];
                }
            }
        }

        return out;
    }
}

module.exports = Request;
