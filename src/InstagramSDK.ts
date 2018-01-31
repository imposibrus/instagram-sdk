
import * as crypto from 'crypto';
import {Readable} from 'stream';
import * as util from 'util';

import * as _ from 'lodash';
import * as tough from 'tough-cookie';
import * as RedisCookieStore from 'redis-cookie-store';
import {LoggerInstance} from 'winston';

import Constants from './Constants';
import Signatures from './Signatures';
import UserSettings from './UserSettings';
import Errors from './Errors';
import Request from './Request';
import GoodUserAgents from './GoodUserAgents';
import Logger from './lib/logger';

const CookieJar = tough.CookieJar;

export class InstagramSDK {
    public static Errors = Errors;

    public getSelfFollowers = this.getSelfFollowedBy;
    public getSelfAllFollowers = this.getSelfAllFollowedBy;

    public jar: tough.CookieJar;
    public appRefreshInterval = 1000 * 60 * 30;
    public settings: any;
    public userAgent: any;
    public logLevel: any;
    public logger: LoggerInstance;
    public proxy: any;
    public uuid: string;
    // tslint:disable:variable-name
    public advertising_id: string;
    public device_id: string;
    public account_id: string | number = 0;
    public rank_token: string | null;
    // tslint:enable:variable-name
    public isLoggedIn: boolean;
    public token: string | null;

    constructor(public username: string, public password: string, userSettingsDirPath: string, options: any = {}) {
        if (!username || !password || !userSettingsDirPath) {
            throw new Error('You must specify both `username`, `password` and `userSettingsDirPath`.');
        }

        this.jar = new CookieJar(new RedisCookieStore(options.redisClient, options.redisPrefix || 'instagram-sdk'));
        this.logLevel = options.LOG_LEVEL || 'INFO';
        this.logger = Logger.getLogger('instagram-sdk', {level: this.logLevel});

        this.settings = new UserSettings(userSettingsDirPath, username, options.redisClient);

        if (_.isObject(options.proxy) && !_.isEmpty(options.proxy.ip) && !_.isEmpty(options.proxy.port)) {
            this.proxy = options.proxy;
        }
    }

    public async setup() {
        let userAgent = await this.settings.get('userAgent');

        if (!userAgent) {
            userAgent = GoodUserAgents.getRandomGoodUserAgent();
            await this.settings.set('userAgent', userAgent);
        }

        this.userAgent = userAgent;

        let resetCookies = false;

        if (
            !await this.settings.get('uuid') ||
            !await this.settings.get('phone_id') ||
            !await this.settings.get('device_id')
        ) {
            await this.settings.set('uuid', Signatures.generateUUID());
            await this.settings.set('phone_id', Signatures.generateUUID());
            await this.settings.set('device_id', Signatures.generateDeviceId());

            await this.settings.set('advertising_id', '');
            await this.settings.set('account_id', 0);
            await this.settings.set('token', '');
            await this.settings.set('last_login', '0');

            resetCookies = true;
        }

        if (!await this.settings.get('advertising_id')) {
            await this.settings.set('advertising_id', Signatures.generateUUID());
        }

        this.uuid = await this.settings.get('uuid');
        this.advertising_id = await this.settings.get('advertising_id');
        this.device_id = await this.settings.get('device_id');

        if (!resetCookies && await this.settings.isMaybeLoggedIn()) {
            this.isLoggedIn = true;
            this.account_id = await this.settings.get('account_id');
            this.rank_token = this.account_id + '_' + this.uuid;
            this.token = await this.settings.get('token');
        } else {
            this.isLoggedIn = false;
            this.account_id = 0;
            this.rank_token = null;
            this.token = null;
        }

        if (resetCookies) {
            await util.promisify((this.jar as any).store.removeAllCookies.bind((this.jar as any).store))();
        }

        setInterval(this._sendLoginFlow.bind(this, false), this.appRefreshInterval);
    }

    //////////////////////////
    //// Helpers
    //////////////////////////

    public async extractCSRFToken({res}: any) {
        const getCookies: any = util.promisify(this.jar.getCookies.bind(this.jar)),
            cookies = await getCookies(res.url),
            CSRFCookie = _.find<{key: string, value: string}>(cookies, {key: 'csrftoken'});

        if (!CSRFCookie) {
            if (!this.token) {
                this.token = 'missing';
            }

            return res;
        }

        this.token = CSRFCookie.value;
    }

    //////////////////////////
    //// Auth
    //////////////////////////

    public getFacebookOTA() {
        return this._request('/facebook_ota/').setBody({
            fields: Constants.FACEBOOK_OTA_FIELDS,
            custom_user_id: this.account_id,
            signed_body: Signatures.generateSignature({}) + '.',
            ig_sig_key_version: Constants.SIG_KEY_VERSION,
            version_code: Constants.VERSION_CODE,
            version_name: Constants.IG_VERSION,
            custom_app_id: Constants.FACEBOOK_ORCA_APPLICATION_ID,
            custom_device_id: this.uuid,
        });
    }

    public getExplore() {
        return this._request('/discover/explore/');
    }

    public getMegaphoneLog() {
        return this._request('/megaphone/log/').setMethod('POST').setBody(Signatures.generateSignature({
            type: 'feed_aysf',
            action: 'seen',
            reason: '',
            _uuid: this.uuid,
            device_id: this.device_id,
            _csrftoken: this.token,
            uuid: crypto.createHash('md5').update(Date.now().toString()).digest('hex'),
        }));
    }

    public getVisualInbox() {
        return this._request('/direct_v2/visual_inbox');
    }

    public getRecentActivity() {
        return this._request('/news/inbox/').setQuery({activity_module: 'all'});
    }

    public getV2Inbox(cursorId = null) {
        const query: any = {};

        if (cursorId) {
            query.cursor = cursorId;
        }

        return this._request('/direct_v2/inbox/').setQuery(query);
    }

    public getRankedRecipients() {
        return this._request('/direct_v2/ranked_recipients').setQuery({show_threads: true});
    }

    public getTimelineFeed(maxId = null) {
        const query: any = {
            rank_token: this.rank_token,
            ranked_content: true,
        };

        if (maxId) {
            query.max_id = maxId;
        }

        return this._request('/feed/timeline').setQuery(query);
    }

    public getRecentRecipients() {
        return this._request('/direct_share/recent_recipients/');
    }

    public getReelsTrayFeed() {
        return this._request('/feed/reels_tray/');
    }

    public getAutoCompleteUserList() {
        return this._request('/friendships/autocomplete_user_list/')
            .setQuery({version: '2'})
            // tslint:disable-next-line no-unused-vars
            .catch((err: Error) => {
                // it's ok, do nothing
            });
    }

    public async syncFeatures(preLogin = false) {
        if (preLogin) {
            return await this._request('/qe/sync/').setMethod('POST').setBody(Signatures.generateSignature({
                id: Signatures.generateUUID(),
                experiments: Constants.LOGIN_EXPERIMENTS,
            })).send();
        } else {
            return await this._request('/qe/sync/').setMethod('POST').setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                _csrftoken: this.token,
                id: this.account_id,
                experiments: Constants.LOGIN_EXPERIMENTS,
            })).send();
        }
    }

    public async login(force = false) {
        if (this.isLoggedIn && !force) {
            await this._sendLoginFlow(false);

            return this;
        }

        await this.syncFeatures(true);
        await this._getSignupChallenge();

        const loginResponse = await this._request('/accounts/login/')
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                phone_id: await this.settings.get('phone_id'),
                device_id: this.device_id,
                guid: this.uuid,
                adid: this.advertising_id,
                username: this.username,
                password: this.password,
                _csrftoken: this.token,
                login_attempt_count: 0,
            })).send();

        await this._updateLoginState(loginResponse);

        if (loginResponse.status === 'fail' || (_.isObject(loginResponse.errors) && !_.isEmpty(loginResponse.errors))) {
            throw new Errors.LoginError(loginResponse.message || loginResponse.errors || loginResponse);
        }

        await this._sendLoginFlow(true);

        return this;
    }

    public checkUsername(username: string) {
        if (!username) {
            throw new Error('Argument `username` is required.');
        }

        /*
         {
         username: 'imposibrus',
         available: false,
         status: 'ok',
         error: 'The username imposibrus is not available.'
         }
         */

        // { username: 'iknergnekjrn', available: true, status: 'ok' }

        return this._request('/users/check_username/')
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                username,
                _csrftoken: 'missing',
            }));
    }

    //////////////////////////
    //// Users
    //////////////////////////
    public getSelf() {
        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this.getUser(this.account_id);
    }

    // tslint:disable-next-line:variable-name
    public getSelfRecentMedia(_options: any = {}) {
        const options = Object.assign({}, _options, {count: 10, min_timestamp: void 0, max_id: void 0});

        return this.getUserRecentMedia(this.account_id, options);
    }

    public getSelfAllMedia(args: any, {timeout = 0} = {}) {
        return new Promise((resolve, reject) => {
            let data: any[] = [];
            const request = (maxId: number | void, cb: (data: any) => void) => {
                args[0].max_id = maxId;

                this.getSelfRecentMedia.call(this, ...args).then((resp: any) => {
                    if (resp.status !== 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                        this.logger.error(resp, `(${resp.requestId})`);

                        return reject('Invalid response: ' + JSON.stringify(resp));
                    }

                    data = data.concat(resp.items || []);

                    if (resp.items && resp.items.length) {
                        setTimeout(() => {
                            request(resp.items.slice(-1)[0].id, cb);
                        }, timeout);
                    } else {
                        cb(data);
                    }
                }).catch((err: any) => {
                    const res = err.res || {};

                    this.logger.error(err, `(${res.requestId})`);
                    reject(err);
                });
            };

            request(void 0, resolve);
        });
    }

    public getUser(userID: string | number) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        // test/fixtures/userInfo.json

        return this._request(`/users/${userID}/info/`);
    }

    public getReelsMediaFeed(usersIDS: Array<string | number>) {
        if (!usersIDS || !usersIDS.length) {
            throw new Error('Argument `usersIDS` is required and must be not empty.');
        }

        return this._request('/feed/reels_media/')
            .setBody(Signatures.generateSignature({
                user_ids: usersIDS.map(String),
            }));
    }

    public getTagsFeed(tagName: string) {
        if (!tagName) {
            throw new Error('Argument `tagName` is required and must be not empty.');
        }

        return this._request(`/feed/tag/${tagName}/`);
    }

    // tslint:disable-next-line:variable-name
    public getUserRecentMedia(userID: string | number, _options: any = {}) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        const options = Object.assign({}, _options, {
            count: 10,
            min_timestamp: void 0,
            max_id: void 0,
            rank_token: this.rank_token,
            ranked_content: 'true',
        });

        // test/fixtures/userFeed.json

        return this._request(`/feed/user/${userID}/`)
            .setQuery(options);
    }

    public getUserAllMedia(args: any[], options: any) {
        return this._paginate(this.getUserRecentMedia, args, options);
    }

    public usersSearch({q = '', count = 10} = {}) {
        // test/fixtures/usersSearch.json

        return this._request('/users/search/')
            .setQuery({
                q,
                count,
                rank_token: this.rank_token,
                ig_sig_key_version: Constants.IG_SIG_KEY,
                is_typeahead: true,
            });
    }

    //////////////////////////
    //// Relationships
    //////////////////////////

    // followed
    public getSelfFollows(query: any = {}) {

        return this.getUserFollows(this.account_id, query);
    }

    public getSelfAllFollows(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 0) {
            args.push({});
        }

        return this._paginate(this.getSelfFollows, args, options);
    }

    public getSelfFollowsStream(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 0) {
            args.push({});
        }

        return this._stream(this.getSelfFollows, args, options);
    }

    public getUserFollows(userID: number | string, query: any = {}) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        query.rank_token = this.rank_token;

        return this._request(`/friendships/${userID}/following/`).setQuery(query);
    }

    public getUserAllFollows(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 1) {
            args.push({});
        }

        return this._paginate(this.getUserFollows, args, options);
    }

    public getUserFollowsStream(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 1) {
            args.push({});
        }

        return this._stream(this.getUserFollows, args, options);
    }

    // followers
    public getSelfFollowedBy(query = {}) {

        return this.getUserFollowers(this.account_id, query);
    }

    public getSelfAllFollowedBy(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 0) {
            args.push({});
        }

        return this._paginate(this.getSelfFollowedBy, args, options);
    }

    public getSelfFollowersStream(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 0) {
            args.push({});
        }

        return this._stream(this.getSelfFollowedBy, args, options);
    }

    public getUserFollowers(userID: string | number, query: any = {}) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        query.rank_token = this.rank_token;

        return this._request(`/friendships/${userID}/followers/`).setQuery(query);
    }

    public getUserAllFollowers(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 1) {
            args.push({});
        }

        return this._paginate(this.getUserFollowers, args, options);
    }

    public getUserFollowersStream(args: any, options: any) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if (args.length === 1) {
            args.push({});
        }

        return this._stream(this.getUserFollowers, args, options);
    }

    public getUserRelationship(userID: string | number) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        // tslint:disable-next-line:max-line-length
        // {"status":"ok","incoming_request":false,"outgoing_request":false,"following":false,"followed_by":false,"blocking":false,"is_private":false}

        return this._request(`/friendships/show/${userID}/`);
    }

    public getUsersRelationships(usersIDS: string[]) {
        if (!usersIDS || !usersIDS.length) {
            throw new Error('Argument `usersIDS` is required and must be not empty.');
        }

        // test/fixtures/friendshipsMany.json

        return this._request('/friendships/show_many/')
            .setMethod('POST')
            .setBody({
                user_ids: usersIDS.join(','),
                _uuid: this.uuid,
                _csrftoken: this.token,
            });
    }

    public followUser(userID: string | number) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this._request(`/friendships/create/${userID}/`)
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                user_id: userID,
                _csrftoken: this.token,
                radio_type: 'wifi-none',
            }));
    }

    public unFollowUser(userID: string | number) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this._request(`/friendships/destroy/${userID}/`)
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                _csrftoken: this.token,
                user_id: userID,
                radio_type: 'wifi-none',
            }));
    }

    //////////////////////////
    //// Media
    //////////////////////////

    public getMediaInfoById(mediaID: string | number) {
        if (!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this._request(`/media/${mediaID}/info/`);
    }

    public getCommentsForMedia(mediaID: string | number, maxId: number | null = null) {
        if (!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        if (!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        // test/fixtures/mediaComments.json

        return this._request(`/media/${mediaID}/comments/`)
            .setBody({
                ig_sig_key_version: Constants.IG_SIG_KEY,
                max_id: maxId,
            });
    }

    public getLikesForMedia(mediaID: string | number) {
        if (!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        // test/fixtures/likers.json

        return this._request(`/media/${mediaID}/likers/`);
    }

    public addLikeForMedia(mediaID: string | number) {
        if (!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        // {"status":"ok"}

        return this._request(`/media/${mediaID}/like/`)
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                _csrftoken: this.token,
                media_id: mediaID,
            }));
    }

    public removeLikeForMedia(mediaID: string | number) {
        if (!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        // {"status":"ok"}

        return this._request(`/media/${mediaID}/unlike/`)
            .setMethod('POST')
            .setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                _csrftoken: this.token,
                media_id: mediaID,
            }));
    }

    public tagsSearch(q = '', count = 20) {
        return this._request('/tags/search/').setQuery({q, count, rank_token: this.rank_token});
    }

    private _request(url = '/users/self') {
        return new Request(this, url);
    }

    private _sendLoginFlow(justLoggedIn: boolean) {
        if (justLoggedIn) {
            return this.syncFeatures()
                .then(() => this.getAutoCompleteUserList())
                .then(() => this.getReelsTrayFeed())
                .then(() => this.getRecentRecipients())
                .then(() => this.getTimelineFeed())
                .then(() => this.getRankedRecipients())
                // push register
                .then(() => this.getV2Inbox())
                .then(() => this.getRecentActivity())
                .then(() => this.getVisualInbox())
                // .then(() => this.getMegaphoneLog())
                .then(() => this.getExplore());
            // .then(() => this.getFacebookOTA())
        } else {
            return this.getTimelineFeed().then((data: any) => {
                if (data.message === 'login_required') {
                    return this.login(true);
                }

                this.settings.set('last_login', Date.now());

                return this.getAutoCompleteUserList()
                    .then(() => this.getReelsTrayFeed())
                    .then(() => this.getRankedRecipients())
                    // push register
                    .then(() => this.getRecentRecipients())
                    // push register
                    .then(() => this.getMegaphoneLog())
                    .then(() => this.getV2Inbox())
                    .then(() => this.getRecentActivity())
                    .then(() => this.getExplore());
            });
        }
    }

    private async _getSignupChallenge() {
        return await this._request('/si/fetch_headers/').setQuery({
            challenge_type: 'signup',
            guid: this.uuid.replace(/-/g, ''),
        }).setParseResponseInJSON(false).send();
    }

    private async _updateLoginState(data: any) {
        this.isLoggedIn = true;
        this.account_id = data.logged_in_user.pk;
        await this.settings.set('account_id', this.account_id);
        this.rank_token = this.account_id + '_' + this.uuid;
        await this.settings.set('token', this.token);
        await this.settings.set('last_login', Date.now());

        return data;
    }

    private _paginate(method = this.getSelfRecentMedia, methodArgs: any[] = [], {
        timeout = 0,
        paginationProp = 'max_id',
        dataProp = 'items',
    } = {}) {
        return new Promise((resolve, reject) => {
            let data: any[] = [];
            const request = (maxId: number | void, cb: (data: any[]) => void) => {
                if (methodArgs.length === 1) {
                    methodArgs[0][paginationProp] = maxId;
                } else {
                    const lastArg = methodArgs.slice(-1)[0];

                    lastArg[paginationProp] = maxId;
                    methodArgs.splice(-1, 1, lastArg);
                }

                method.call(this, ...methodArgs).then((resp: any) => {
                    if (resp.status !== 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                        this.logger.error(resp, `(${resp.requestId})`);

                        return reject('Invalid response: ' + JSON.stringify(resp));
                    }

                    data = data.concat(resp[dataProp]);

                    if (resp.pagination && resp.pagination['next_' + paginationProp]) {
                        setTimeout(() => {
                            request(resp.pagination['next_' + paginationProp], cb);
                        }, timeout);
                    } else if (resp['next_' + paginationProp]) {
                        setTimeout(() => {
                            request(resp['next_' + paginationProp], cb);
                        }, timeout);
                    } else {
                        cb(data);
                    }
                }).catch((err: any) => {
                    const res = err.res || {};

                    this.logger.error(err, `(${res.requestId})`);
                    reject(err);
                });
            };

            request(void 0, resolve);
        });
    }

    // FIXME: rewrite to normal streams

    private _stream(method = this.getSelfRecentMedia, methodArgs = [], {
        timeout = 0,
        paginationProp = 'max_id',
        dataProp = 'items',
    } = {}) {
        const rs: any = new Readable({
            objectMode: true,
            read: (): any => {
                if (rs._closing) {
                    return false;
                }
            },
        });

        rs._closing = false;
        rs.close = () => {
            rs._closing = true;
            process.nextTick(() => {
                rs.push(null);
                // hacking private API :(
                rs._readableState.ended = true;
                rs._readableState.length = 0;
                rs._readableState.buffer = [];
            });
        };

        const request = (maxId: number | void) => {
            if (methodArgs.length === 1) {
                methodArgs[0][paginationProp] = maxId;
            } else {
                const lastArg = methodArgs.slice(-1)[0];

                lastArg[paginationProp] = maxId;
                methodArgs.splice(-1, 1, lastArg);
            }

            method.call(this, ...methodArgs).then((resp: any) => {
                const items = resp[dataProp];

                if (resp.status !== 'ok' || !_.isArray(items)) {
                    this.logger.error(resp, `(${resp.requestId})`);

                    return rs.emit('error', new Error('Invalid response: ' + JSON.stringify(resp)));
                }

                for (const item of items) {
                    if (rs._closing) {
                        break;
                    }

                    rs.push(item);
                }

                if (rs._closing) {
                    return false;
                }

                if (resp.pagination && resp.pagination['next_' + paginationProp]) {
                    setTimeout(() => {
                        request(resp.pagination['next_' + paginationProp]);
                    }, timeout);
                } else if (resp['next_' + paginationProp]) {
                    setTimeout(() => {
                        request(resp['next_' + paginationProp]);
                    }, timeout);
                } else {
                    if (!rs._closing) {
                        process.nextTick(() => {
                            rs.push(null);
                        });
                    }
                }
            }).catch((err: any) => {
                const res = err.res || {};

                this.logger.error(err);
                rs.emit('error', err, `(${res.requestId})`);
            });
        };

        request(void 0);

        return rs;
    }
}
