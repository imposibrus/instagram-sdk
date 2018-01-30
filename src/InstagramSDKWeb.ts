
import * as util from 'util';

import * as _ from 'lodash';
import * as tough from 'tough-cookie';
import * as BigNumber from 'big-number';

import {
    Request, IGBody, IGLogin, IGResponse, IGUserFollowersBody, IGUserFollowsBody, IGUserObject, IGUserPostsBody,
    IGUserResponseObject, IGOpenPostBody, IGFollowerNode, IGUserPostNode, IGLocationBody, IGLocationObject,
} from './RequestWeb';
import Errors from './Errors';
import {GenericStream, CustomSuccessHandler} from './GenericStream';

export interface SDKOptions {
    cookieJarStore?: tough.Store;
}

export type getCookies = (currentUrl: string, options?: tough.CookieJar.GetCookiesOptions) => Promise<tough.Cookie[]>;
export type getCookieString = (currentUrl: string, options?: tough.CookieJar.GetCookiesOptions) => Promise<string>;
export type setCookie = (
    cookieOrString: tough.Cookie | string,
    currentUrl: string,
    options?: tough.CookieJar.SetCookieOptions,
) => Promise<tough.Cookie[]>;

export class IGSDK {
    public static Errors = Errors;
    public static alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    public static idToShortCode(id: number | string) {
        let photoId = new BigNumber(id.toString().split('_')[0]),
            code = '';

        while (photoId.gt(0)) {
            const prevId = photoId.val(),
                remainder = Number(photoId.mod(64));

            photoId = new BigNumber(prevId).minus(remainder).div(64);
            code = this.alphabet[remainder] + code;
        }

        return code;
    }

    public static shortCodeToId(code: string) {
        let id = new BigNumber(0);

        for (const char of code) {
            id = id.multiply(64).plus(this.alphabet.indexOf(char));
        }

        return id.toString();
    }

    public static withCredentials(username: string, password: string, options?: SDKOptions) {
        const instance = new IGSDK(options);

        instance.username = username;
        instance.password = password;

        return instance;
    }

    public static genHeaders(token: string, cookies: tough.Cookie[]) {
        const CSRFToken = token || _.get(cookies.find((cookie) => cookie.key === 'csrftoken'), 'value');

        return {
            referer: `${Request.baseUrl}/`,
            'x-csrftoken': CSRFToken,
        };
    }

    public options: SDKOptions = {};
    public username: string;
    public password: string;
    public jar: tough.CookieJar;
    public logLevel = process.env.LOG_LEVEL || 'INFO';
    public token: string;
    public getCookies: getCookies;
    public getCookieString: getCookieString;
    public setCookie: setCookie;

    private defaultOptions: SDKOptions = {};

    constructor(options: SDKOptions = {}) {
        this.options = Object.assign({}, this.defaultOptions, options);
        this.jar = new tough.CookieJar(options.cookieJarStore);
        this.getCookies = util.promisify<getCookies>(this.jar.getCookies.bind(this.jar));
        this.getCookieString = util.promisify<getCookieString>(this.jar.getCookieString.bind(this.jar));
        this.setCookie = util.promisify<setCookie>(this.jar.setCookie.bind(this.jar));
    }

    public async extractCSRFToken<TBody>(res: IGResponse<TBody>) {
        const cookies = await this.getCookies(res.url),
            CSRFCookie = cookies.find((cookie) => cookie.key === 'csrftoken');

        if (!CSRFCookie) {
            if (!this.token) {
                this.token = 'missing';
            }

            return;
        }

        this.token = CSRFCookie.value;
    }

    public makeStream<TQuery, TBody, TOut>(
        method: string,
        pathToItems: string,
        pathToPageInfo: string,
        paginationProp: string,
        query: TQuery,
        customSuccessHandler?: CustomSuccessHandler<TQuery, TBody, TOut>,
    ) {
        return new GenericStream<TQuery, TBody & IGBody, TOut>(
            {objectMode: true, highWaterMark: 1},
            this,
            method,
            pathToItems,
            pathToPageInfo,
            paginationProp,
            query,
            customSuccessHandler,
        );
    }

    public getUserByName(userName: string) {
        return this.request<IGUserResponseObject>(`/${userName}/`)
            .setQuery({__a: 1})
            .send();
    }

    public async login(force = false) {
        if (!force && await this.isLoggedIn()) {
            return true;
        }

        const req = this.request(`/`)
            .setMethod('HEAD')
            .setParseResponseInJSON(false);

        await req.send();

        if (!req.response) {
            throw new Error('request has been failed');
        }

        const cookies = Request.parseCookies(req.response.headers);

        return this.request<IGLogin>(`/accounts/login/ajax/`)
            .setMethod('POST')
            .setHeaders(IGSDK.genHeaders(this.token, cookies))
            .setBody({
                username: this.username,
                password: this.password,
            })
            .send();
    }

    public async isLoggedIn() {
        const cookies = await this.getCookies(`${Request.baseUrl}/`),
            sessionIdCookie = cookies.find((cookie) => cookie.key === 'sessionid');

        if (!sessionIdCookie) {
            return false;
        }

        const req = this.request<string>(`/`)
            .setMethod('HEAD')
            .setHeaders(IGSDK.genHeaders(this.token, cookies))
            .setParseResponseInJSON(false);

        await req.send();

        if (!req.response) {
            return false;
        }

        const responseCookies = Request.parseCookies(req.response.headers),
            userIdCookie = responseCookies.find((cookie) => cookie.key === 'ds_user_id');

        return !!userIdCookie;
    }

    public getPostById(id: number | string) {
        const code = IGSDK.idToShortCode(id);

        return this.getPostByShortCode(code);
    }

    public getPostByShortCode(shortCode: string) {
        return this.request<IGOpenPostBody>(`/p/${shortCode}/`)
            .setQuery({__a: 1})
            .send();
    }

    public getLocationById(locationId: string | number) {
        return this.request<IGLocationBody>(`/explore/locations/${locationId}/`)
            .setQuery({__a: 1, max_id: ''})
            .send();
    }

    public graphQLQuery<T, TBody>(opts: T, queryId: string): Promise<IGResponse<TBody> | TBody> {
        return this.request<TBody>('/graphql/query/')
            .setQuery({
                query_id: queryId,
                variables: JSON.stringify(opts),
            })
            .send();
    }

    public getUserFollowers(opts: GenericGraphQLOptions) {
        return this.graphQLQuery<GenericGraphQLOptions, IGUserFollowersBody>(opts, '17851374694183129');
    }

    public getUserFollows(opts: GenericGraphQLOptions) {
        return this.graphQLQuery<GenericGraphQLOptions, IGUserFollowsBody>(opts, '17874545323001329');
    }

    public getUserPosts(opts: GenericGraphQLOptions) {
        return this.graphQLQuery<GenericGraphQLOptions, IGUserPostsBody>(opts, '17888483320059182');
    }

    public makeUserFollowersSteam(opts: GenericGraphQLOptions) {
        return this.makeStream<GenericGraphQLOptions, IGUserFollowersBody, IGFollowerNode>(
            'getUserFollowers',
            'data.user.edge_followed_by.edges',
            'data.user.edge_followed_by.page_info',
            'after',
            opts,
        );
    }

    public makeUserFollowsSteam(opts: GenericGraphQLOptions) {
        return this.makeStream<GenericGraphQLOptions, IGUserFollowsBody, IGFollowerNode>(
            'getUserFollows',
            'data.user.edge_follow.edges',
            'data.user.edge_follow.page_info',
            'after',
            opts,
        );
    }

    public makeUserPostsSteam(opts: GenericGraphQLOptions) {
        return this.makeStream<GenericGraphQLOptions, IGUserPostsBody, IGUserPostNode>(
            'getUserPosts',
            'data.user.edge_owner_to_timeline_media.edges',
            'data.user.edge_owner_to_timeline_media.page_info',
            'after',
            opts,
        );
    }

    public request<TBody>(path: string) {
        return new Request<TBody>(this, path);
    }
}

export interface GenericGraphQLOptions {
    id: number; // user id
    first: number; // page size
    after?: string; // pagination property
}

export {
    IGBody, IGLogin, IGResponse, IGFollowerNode, IGUserFollowersBody, IGUserFollowsBody, IGUserPostsBody,
    IGUserResponseObject, IGUserObject, IGUserMedia, Paginable, IGUserPostNode, IGUserAllMediaNode, IGTextNode,
    IGUserMediaGenericNode, IGUserLastMediaNode, IGUserMediaThumbnail, IGCountable, IGPostOwnerObject,
    IGUserMinimalObject, IGPostLikeNode, IGPostCommentNode, IGPostTaggedNode, IGPostOpenObject, IGOpenPostBody,
    IGUserMediaGenericListNode, IGLocationBody, IGLocationObject,
} from './RequestWeb';
export {GenericStream} from './GenericStream';
