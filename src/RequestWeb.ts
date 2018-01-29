
import * as util from 'util';
import * as http from 'http';

import * as _ from 'lodash';
import * as tough from 'tough-cookie';
import * as got from 'got';
import * as uuid from 'uuid';
// import * as tunnel from 'tunnel';

import Errors from './Errors';
import _logger from './lib/logger';
import {IGSDK} from './InstagramSDKWeb';

const Cookie = tough.Cookie,
    logger = _logger.getLogger('instagram-sdk:Request');

export class Request<TBody> {
    public static baseUrl = 'https://www.instagram.com';

    public static parseCookies(headers: http.IncomingHttpHeaders): tough.Cookie[] {
        const setCookieHeader: string | string[] = _.get(headers, 'set-cookie', ''),
            filteredCookies = [];

        let parsedCookies: Array<tough.Cookie | undefined>;

        if (Array.isArray(setCookieHeader)) {
            parsedCookies = setCookieHeader.map((str) => Cookie.parse(str));
        } else {
            parsedCookies = [Cookie.parse(setCookieHeader)];
        }

        for (const cookie of parsedCookies) {
            if (!cookie) {
                continue;
            }

            filteredCookies.push(cookie);
        }

        return filteredCookies;
    }

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

    public requestId = uuid.v4();
    public method = 'GET';
    public body = {};
    public query = {};
    public headers: http.OutgoingHttpHeaders = {
        // Connection: 'keep-alive',
        // Accept: '*/*',
    };
    public defaultRequestOptions: got.GotOptions<string | null> = {
        decompress: true,
        followRedirect: true,
    };
    public checkStatusCode = true;
    public successStatusCodes = new Set([200, 204]);
    // public repeatOnTooManyRequestsInterval = 0;
    public parseResponseInJSON = true;
    public reloginOnError = true;
    public logger: IntelLoggerInstance;
    public url: string;
    public response: null | IGResponse<TBody>;

    constructor(public sdk: IGSDK, url: string) {
        this.url = Request.baseUrl + url;
        this.logger = logger.setLevel(this.sdk.logLevel);
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

    public setBody(body: object) {
        this.body = body;

        return this;
    }

    public setQuery(query: object) {
        this.query = query;

        return this;
    }

    public setHeaders(headers: http.OutgoingHttpHeaders) {
        this.headers = headers;

        return this;
    }

    public async getResultHeaders(): Promise<http.OutgoingHttpHeaders | undefined> {
        const cookie = await this.sdk.getCookieString(this.url);
        let headers = this.headers;

        if (cookie) {
            headers = Object.assign({}, this.headers, {cookie});
        }

        if (_.isEmpty(headers)) {
            return undefined;
        }

        return headers;
    }

    public getResultQuery(): QueryString {
        const query = Request._normalizeQueryParams(this.query);

        if (_.isEmpty(query)) {
            return undefined;
        }

        return query;
    }

    public getRequestOptions(headers: http.OutgoingHttpHeaders | undefined, query: QueryString): got.GotJSONOptions {
        const opts: got.GotJSONOptions = {
            method: this.method,
            json: true,
            headers,
            query,
        };

        return Object.assign({}, this.defaultRequestOptions, opts);
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

    public async send(): Promise<TBody> {
        const headers = await this.getResultHeaders(),
            query = this.getResultQuery(),
            options = this.getRequestOptions(headers, query);

        // if (this.sdk.proxy) {
        //     options.agent = tunnel.httpOverHttp({
        //         proxy: {
        //             host: this.sdk.proxy.ip,
        //             port: this.sdk.proxy.port,
        //             headers: {},
        //         },
        //     });
        //     this.logger.debug(`(${this.requestId}) Request.send: using proxy: %j`, this.sdk.proxy);
        // }
        
        if (!_.isEmpty(this.body)) {
            options.body = this.body;
            options.form = true;
            this.logger.debug(`(${this.requestId}) Request.send: request with body: %:2j`, this.body);
        }

        this.logger.debug(
            `(${this.requestId}) Request.send: request to %s with params: %:2j`,
            this.url,
            _.omit(options, ['body']),
        );

        return got(this.url, options).catch((err) => {
            if (err.response) {
                err.response.requestId = this.requestId;
            }

            err.res = err.response;

            if (err instanceof got.HTTPError) {
                if (this.checkStatusCode && !this.successStatusCodes.has(err.statusCode)) {
                    if (err.statusCode === 429) {
                        const error = new Errors.ThrottledError();

                        error.res = err.response;

                        throw error;
                    }

                } else {
                    this.logger.debug(err);

                    return Promise.resolve(err.response);
                }
            }

            throw err;
        }).then(async (res: IGResponse<TBody>) => {
            this.response = res;
            res.requestId = this.requestId;

            this.logger.debug(`(${this.requestId}) Request.send: response statusCode:`, res.statusCode);
            this.logger.debug(`(${this.requestId}) Request.send: response headers: %:2j`, res.headers);

            const cookies = Request.parseCookies(res.headers);

            for (const cookie of cookies) {
                await this.sdk.setCookie(cookie, this.url);
            }

            await this.sdk.extractCSRFToken<TBody>(res);

            // if (this.repeatOnTooManyRequestsInterval && res.statusCode === 429) {
            //     return setTimeout(this.send.bind(this), this.repeatOnTooManyRequestsInterval);
            // }

            // if (this.reloginOnError && res.body.message === 'login_required') {
            //     this.logger.debug(
            //         `(${this.requestId}) Request.send: 'login_required', try again: %j`,
            //         res.body,
            //     );
            //
            //     return this.sdk.login(true).then(() => {
            //         return this.send();
            //     });
            // }

            if (this.parseResponseInJSON) {
                this.logger.debug(
                    `(${this.requestId}) Request.send parsing JSON: response: %.-500s`,
                    util.inspect(res.body, {depth: 5}),
                );
            }

            if (res.body) {
                res.body.requestId = this.requestId;
            }

            return Promise.resolve(res.body);
        });
    }
}

export interface IGResponse<T> extends got.Response<T & IGBody> {
    requestId: string;
}

export interface IGBody {
    requestId: string;
    status?: string;
    message?: string;
    data?: any;
}

export type QueryString = object | undefined;

export interface IGLogin extends IGBody {
    authenticated: boolean;
    user: boolean;
    reactivated: boolean;
    status: 'ok';
}

export interface IGFollowerNode {
    node: IGFollowerObject;
}

export interface IGFollowerObject extends IGUserMinimalObject {
    full_name: string | null;
    is_verified: boolean;
}

export interface IGUserFollowersBody extends IGBody {
    data: {
        user: {
            edge_followed_by: Paginable & {
                edges: IGFollowerNode[];
            };
        };
    };
}

export interface IGUserFollowsBody extends IGBody {
    data: {
        user: {
            edge_follow: Paginable & {
                edges: IGFollowerNode[];
            };
        };
    };
}

export interface IGUserPostsBody extends IGBody {
    data: {
        user: {
            edge_owner_to_timeline_media: Paginable & {
                edges: IGUserPostNode[];
            };
        };
    };
}

export interface IGUserResponseObject extends IGBody {
    logging_page_id?: string;
    user: IGUserObject;
}

export interface IGUserObject {
    biography: string | null;
    external_url: string | null;
    external_url_linkshimmed: string | null;
    followed_by: IGCountable;
    follows: IGCountable;
    full_name: string | null;
    id: string;
    is_private: boolean;
    is_verified: boolean;
    profile_pic_url: string;
    profile_pic_url_hd: string;
    username: string;
    media: IGUserMedia;
    saved_media: IGUserMedia;
}

export interface IGUserMedia extends Paginable {
    nodes: IGUserLastMediaNode[];
}

export interface Paginable {
    count: number;
    page_info: {
        has_next_page: boolean;
        end_cursor: string | null;
    };
}

export interface IGUserPostNode {
    node: IGUserAllMediaNode;
}

export interface IGTextNode {
    node: {
        text: string;
    };
}

export interface IGUserMediaGenericListNode extends IGUserMediaGenericNode {
    owner: {
        id: string;
    };
    thumbnail_src: string;
    thumbnail_resources: IGUserMediaThumbnail[];
}

export interface IGUserMediaGenericNode {
    __typename?: 'GraphImage' | 'GraphVideo' | 'GraphSidecar';
    id: string;
    comments_disabled?: boolean;
    dimensions: {
        width: number;
        height: number;
    };
    is_video: boolean;
}

export interface IGUserAllMediaNode extends IGUserMediaGenericListNode {
    edge_media_to_caption: {
        edges: IGTextNode[];
    };
    shortcode: string;
    edge_media_to_comment: IGCountable;
    taken_at_timestamp: number;
    display_url: string;
    edge_media_preview_like: IGCountable;
}

export interface IGUserLastMediaNode extends IGUserMediaGenericListNode {
    gating_info?: null;
    media_preview?: string | null; // base64
    code: string; // shortCode
    date: number;
    display_src: string;
    video_views?: number;
    caption: string;
    comments: IGCountable;
    likes: IGCountable;
}

export interface IGUserMediaThumbnail {
    src: string;
    config_width: number;
    config_height: number;
}

export interface IGCountable {
    count: number;
}

export interface IGOpenPostBody {
    graphql: {
        shortcode_media: IGPostOpenObject;
    };
}

export interface IGPostOpenObject extends IGUserMediaGenericNode {
    shortcode: string;
    gating_info: null;
    media_preview: string | null;
    display_url: string;
    display_resources: IGUserMediaThumbnail[];
    video_url?: string;
    video_view_count?: number;
    edge_media_to_tagged_user: {
        edges: IGPostTaggedNode[];
    };
    edge_media_to_caption: {
        edges: IGTextNode[];
    };
    edge_media_to_comment: Paginable & {
        edges: IGPostCommentNode[];
    };
    taken_at_timestamp: number;
    edge_media_preview_like: IGCountable & {
        edges: IGPostLikeNode[];
    };
    location: IGPostOpenLocationObject | null;
    owner: IGPostOwnerObject;
    is_ad: boolean;
}

export interface IGPostOpenLocationObject {
    id: string;
    has_public_page: boolean;
    name: string;
    slug: string;
}

export interface IGPostTaggedNode {
    node: {
        user: {
            username: string;
        };
        x: number;
        y: number;
    };
}

export interface IGPostCommentNode {
    node: {
        id: string;
        text: string;
        created_at: number;
        owner: IGUserMinimalObject;
    };
}

export interface IGPostLikeNode {
    node: IGUserMinimalObject;
}

export interface IGUserMinimalObject {
    id: string;
    profile_pic_url: string;
    username: string;
}

export interface IGPostOwnerObject extends IGUserMinimalObject {
    full_name: string | null;
    is_private: boolean;
    is_verified: boolean;
}

export interface IGLocationBody {
    location: IGLocationObject;
    logging_page_id: string;
}

export interface IGLocationObject {
    id: string;
    name: string;
    has_public_page: boolean;
    lat: number;
    lng: number;
    slug: string;
    media: IGLocationMedia;
    top_posts: IGLocationMedia;
    directory: Directory;
}

export interface IGLocationMedia extends Paginable {
    nodes: IGLocationGenericMediaNode[];
}

export interface IGLocationGenericMediaNode extends IGUserLastMediaNode {
    edge_media_preview_like: IGCountable;
}

export interface Directory {
    country: CountryOrCity;
    city: CountryOrCity;
}

export interface CountryOrCity {
    id: string;
    name: string;
    slug: string;
}
