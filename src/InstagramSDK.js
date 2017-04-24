
const crypto = require('crypto'),
    {Readable} = require('stream'),

    Promise = require('bluebird'),
    request = require('request'),
    intel = require('intel'),
    FileCookieStore = require('tough-cookie-filestore'),
    _ = require('lodash'),

    Constants = require('./Constants'),
    Signatures = require('./Signatures'),
    UserSettings = require('./UserSettings'),
    Errors = require('./Errors'),
    Request = require('./Request'),
    GoodUserAgents = require('./GoodUserAgents'),
    logger = require('./lib/logger').getLogger('instagram-sdk');

class InstagramSDK {
    settings;
    userAgent;
    logLevel;
    logger;
    appRefreshInterval = 1000 * 60 * 30;

    /**
     *
     * @param {String} username
     * @param {String} password
     * @param {String} userSettingsDirPath
     * @param {Object} options
     */
    // eslint-disable-next-line no-unused-vars
    constructor(username, password, userSettingsDirPath, options = {}) {
        if(!username || !password || !userSettingsDirPath) {
            throw new Error('You must specify both `username`, `password` and `userSettingsDirPath`.');
        }

        this.logLevel = intel[options.LOG_LEVEL || 'INFO'];
        this.logger = logger.setLevel(this.logLevel);

        this.username = username;
        this.password = password;

        this.settings = new UserSettings(userSettingsDirPath, username);

        let userAgent = this.settings.get('userAgent');

        if (!userAgent) {
            userAgent = GoodUserAgents.getRandomGoodUserAgent();
            this.settings.set('userAgent', userAgent);
        }

        this.userAgent = userAgent;

        let resetCookies = false;

        if (!this.settings.get('uuid') || !this.settings.get('phone_id') || !this.settings.get('device_id')) {
            this.settings.set('uuid', Signatures.generateUUID());
            this.settings.set('phone_id', Signatures.generateUUID());
            this.settings.set('device_id', Signatures.generateDeviceId());

            this.settings.set('advertising_id', '');
            this.settings.set('account_id', '');
            this.settings.set('token', '');
            this.settings.set('last_login', '0');

            resetCookies = true;
        }

        if (!this.settings.get('advertising_id')) {
            this.settings.set('advertising_id', Signatures.generateUUID());
        }

        this.uuid = this.settings.get('uuid');
        this.advertising_id = this.settings.get('advertising_id');
        this.device_id = this.settings.get('device_id');

        if (!resetCookies && this.settings.isMaybeLoggedIn()) {
            this.isLoggedIn = true;
            this.account_id = this.settings.get('account_id');
            this.rank_token = this.account_id + '_' + this.uuid;
            this.token = this.settings.get('token');
        } else {
            this.isLoggedIn = false;
            this.account_id = null;
            this.rank_token = null;
            this.token = null;
        }

        if (resetCookies) {
            this.settings.resetCookies();
        }

        this.jar = request.jar(new FileCookieStore(this.settings.cookiesFilePath));

        setInterval(this._sendLoginFlow.bind(this, false), this.appRefreshInterval);
    }

    //////////////////////////
    //// Helpers
    //////////////////////////

    extractCSRFToken({res}) {
        const cookies = this.jar.getCookies(res.request.href),
            CSRFCookie = _.find(cookies, {key: 'csrftoken'});

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

    _sendLoginFlow(justLoggedIn) {
        if (justLoggedIn) {
            return this.syncFeatures()
                .then(() => this.getAutoCompleteUserList())
                .then(() => this.getReelsTrayFeed())
                .then(() => this.getRecentRecipients())
                .then(() => this.getTimelineFeed())
                .then(() => this.getRankedRecipients())
                //push register
                .then(() => this.getV2Inbox())
                .then(() => this.getRecentActivity())
                .then(() => this.getVisualInbox())
                //.then(() => this.getMegaphoneLog())
                .then(() => this.getExplore());
            //.then(() => this.getFacebookOTA())
        } else {
            return this.getTimelineFeed().then((data) => {
                if (data.message === 'login_required') {
                    return this.login(true);
                }

                this.settings.set('last_login', Date.now());

                return this.getAutoCompleteUserList()
                    .then(() => this.getReelsTrayFeed())
                    .then(() => this.getRankedRecipients())
                    //push register
                    .then(() => this.getRecentRecipients())
                    //push register
                    .then(() => this.getMegaphoneLog())
                    .then(() => this.getV2Inbox())
                    .then(() => this.getRecentActivity())
                    .then(() => this.getExplore());
            });
        }
    }

    getFacebookOTA() {
        return this._request('/facebook_ota/').setBody({
            fields: Constants.FACEBOOK_OTA_FIELDS,
            custom_user_id: this.account_id,
            signed_body: Signatures.generateSignature('') + '.',
            ig_sig_key_version: Constants.SIG_KEY_VERSION,
            version_code: Constants.VERSION_CODE,
            version_name: Constants.IG_VERSION,
            custom_app_id: Constants.FACEBOOK_ORCA_APPLICATION_ID,
            custom_device_id: this.uuid,
        });
    }

    getExplore() {
        return this._request('/discover/explore/');
    }

    getMegaphoneLog() {
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

    getVisualInbox() {
        return this._request('/direct_v2/visual_inbox');
    }

    getRecentActivity() {
        return this._request('/news/inbox/').setQuery({activity_module: 'all'});
    }

    getV2Inbox(cursorId = null) {
        let query = {};

        if (cursorId) {
            query.cursor = cursorId;
        }

        return this._request('/direct_v2/inbox/').setQuery(query);
    }

    getRankedRecipients() {
        return this._request('/direct_v2/ranked_recipients').setQuery({show_threads: true});
    }

    getTimelineFeed(maxId = null) {
        let query = {
            rank_token: this.rank_token,
            ranked_content: true
        };

        if (maxId) {
            query.max_id = maxId;
        }

        return this._request('/feed/timeline').setQuery(query);
    }

    getRecentRecipients() {
        return this._request('/direct_share/recent_recipients/');
    }

    getReelsTrayFeed() {
        return this._request('/feed/reels_tray/');
    }

    getAutoCompleteUserList() {
        return this._request('/friendships/autocomplete_user_list/')
            .setQuery({version: '2'})
            // eslint-disable-next-line no-unused-vars
            .catch(Errors.ThrottledError, ({res, resData}) => {
                // it's ok, do nothing
            });
    }

    syncFeatures(preLogin = false) {
        if (preLogin) {
            return this._request('/qe/sync/').setMethod('POST').setBody(Signatures.generateSignature({
                id: Signatures.generateUUID(),
                experiments: Constants.LOGIN_EXPERIMENTS,
            }));
        } else {
            return this._request('/qe/sync/').setMethod('POST').setBody(Signatures.generateSignature({
                _uuid: this.uuid,
                _uid: this.account_id,
                _csrftoken: this.token,
                id: this.account_id,
                experiments: Constants.LOGIN_EXPERIMENTS,
            }));
        }
    }

    _getSignupChallenge() {
        return this._request('/si/fetch_headers/').setQuery({
            challenge_type: 'signup',
            guid: this.uuid.replace(/-/g, '')
        }).setParseResponseInJSON(false);
    }

    _updateLoginState(data) {
        this.isLoggedIn = true;
        this.account_id = data.logged_in_user.pk;
        this.settings.set('account_id', this.account_id);
        this.rank_token = this.account_id + '_' + this.uuid;
        this.settings.set('token', this.token);
        this.settings.set('last_login', Date.now());
    }

    login(force = false) {
        if (this.isLoggedIn && !force) {
            return this._sendLoginFlow(false).then(() => {
                return Promise.resolve(this);
            });
        }

        return this.syncFeatures(true).then(() => {
            return this._getSignupChallenge()
                .then(() => {
                    return this._request('/accounts/login/')
                        .setMethod('POST')
                        .setBody(Signatures.generateSignature({
                            phone_id: this.settings.get('phone_id'),
                            device_id: this.device_id,
                            guid: this.uuid,
                            adid: this.advertising_id,
                            username: this.username,
                            password: this.password,
                            _csrftoken: this.token,
                            login_attempt_count: 0,
                        }))
                        .tap(this._updateLoginState.bind(this))
                        .then((data) => {
                            if (data.status === 'fail' || (_.isObject(data.errors) && !_.isEmpty(data.errors))) {
                                throw new Errors.LoginError(data.message || data.errors || data);
                            }

                            return this._sendLoginFlow(true).then(() => {
                                return {
                                    device_id: this.device_id,
                                    uuid: this.uuid,
                                    token: this.token,
                                    isLoggedIn: this.isLoggedIn,
                                    account_id: this.account_id,
                                    rank_token: this.rank_token,
                                };
                            });

                        });
                });
        });

    }

    checkUsername(username) {
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
                username: username,
                _csrftoken: 'missing'
            }));
    }

    //////////////////////////
    //// Users
    //////////////////////////
    getSelf() {
        if(!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this.getUser(this.account_id);
    }

    getSelfRecentMedia({count = 10, min_timestamp = undefined, max_id = undefined} = {}) {
        return this.getUserRecentMedia(this.account_id, {count, min_timestamp, max_id});
    }

    _paginate(method = this.getSelfRecentMedia, methodArgs = [], {timeout = 0, paginationProp = 'max_id', dataProp = 'items'} = {}) {
        return new Promise((resolve, reject) => {
            let data = [],
                request = (max_id, cb) => {
                    if(methodArgs.length === 1) {
                        methodArgs[0][paginationProp] = max_id;
                    } else {
                        let lastArg = methodArgs.slice(-1)[0];

                        lastArg[paginationProp] = max_id;
                        methodArgs.splice(-1, 1, lastArg);
                    }

                    method.call(this, ...methodArgs).then((resp) => {
                        if(resp.status !== 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                            this.logger.critical('trace', resp, `(${resp.requestId})`);

                            return reject('Invalid response: ' + JSON.stringify(resp));
                        }

                        data = data.concat(resp[dataProp]);

                        if(resp.pagination && resp.pagination['next_' + paginationProp]) {
                            setTimeout(() => {
                                request(resp.pagination['next_' + paginationProp], cb);
                            }, timeout);
                        } else if(resp['next_' + paginationProp]) {
                            setTimeout(() => {
                                request(resp['next_' + paginationProp], cb);
                            }, timeout);
                        } else {
                            cb(data);
                        }
                    }).catch((err) => {
                        let res = err.res || {};

                        this.logger.critical('trace', err, `(${res.requestId})`);
                        reject(err);
                    });
                };

            request(null, resolve);
        });
    }

    // FIXME: rewrite to normal streams

    _stream(method = this.getSelfRecentMedia, methodArgs = [], {timeout = 0, paginationProp = 'max_id', dataProp = 'items'} = {}) {
        let rs = new Readable({
            objectMode: true,
            read: () => {
                if(rs._closing) {
                    return false;
                }
            }
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

        const request = (max_id) => {
            if(methodArgs.length === 1) {
                methodArgs[0][paginationProp] = max_id;
            } else {
                let lastArg = methodArgs.slice(-1)[0];

                lastArg[paginationProp] = max_id;
                methodArgs.splice(-1, 1, lastArg);
            }

            method.call(this, ...methodArgs).then((resp) => {
                const items = resp[dataProp];

                if(resp.status !== 'ok' || !_.isArray(items)) {
                    this.logger.critical('trace', resp, `(${resp.requestId})`);

                    return rs.emit('error', new Error('Invalid response: ' + JSON.stringify(resp)));
                }

                for(let i = 0; i < items.length; i++) {
                    if(rs._closing) {
                        break;
                    }

                    rs.push(items[i]);
                }

                if(rs._closing) {
                    return false;
                }

                if(resp.pagination && resp.pagination['next_' + paginationProp]) {
                    setTimeout(() => {
                        request(resp.pagination['next_' + paginationProp]);
                    }, timeout);
                } else if(resp['next_' + paginationProp]) {
                    setTimeout(() => {
                        request(resp['next_' + paginationProp]);
                    }, timeout);
                } else {
                    if(!rs._closing) {
                        process.nextTick(() => {
                            rs.push(null);
                        });
                    }
                }
            }).catch((err) => {
                let res = err.res || {};

                this.logger.critical('trace', err);
                rs.emit('error', err, `(${res.requestId})`);
            });
        };

        request(null);

        return rs;
    }

    getSelfAllMedia(args, {timeout = 0} = {}) {
        return new Promise((resolve, reject) => {
            let data = [],
                request = (max_id, cb) => {
                    args[0]['max_id'] = max_id;

                    this.getSelfRecentMedia.call(this, ...args).then((resp) => {
                        if(resp.status !== 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                            this.logger.critical('trace', resp, `(${resp.requestId})`);

                            return reject('Invalid response: ' + JSON.stringify(resp));
                        }

                        data = data.concat(resp.items || []);

                        if(resp.items && resp.items.length) {
                            setTimeout(() => {
                                request(resp.items.slice(-1)[0].id, cb);
                            }, timeout);
                        } else {
                            cb(data);
                        }
                    }).catch((err) => {
                        let res = err.res || {};

                        this.logger.critical('trace', err, `(${res.requestId})`);
                        reject(err);
                    });
                };

            request(null, resolve);
        });
    }

    getUser(userID) {
        if (!userID) {
            throw new Error('Argument `userID` is required.');
        }

        // test/fixtures/userInfo.json

        return this._request(`/users/${userID}/info/`);
    }

    /**
     * @param {String[]|Number[]} usersIDS
     **/
    getReelsMediaFeed(usersIDS) {
        if (!usersIDS || !usersIDS.length) {
            throw new Error('Argument `usersIDS` is required and must be not empty.');
        }

        return this._request('/feed/reels_media/')
            .setBody(Signatures.generateSignature({
                user_ids: usersIDS.map(String),
            }));
    }

    getUserRecentMedia(userID, {count = 10, min_timestamp = undefined, max_id = undefined} = {}) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if(!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        // test/fixtures/userFeed.json

        return this._request(`/feed/user/${userID}/`)
            .setQuery({
                count,
                min_timestamp,
                max_id,
                rank_token: this.rank_token,
                ranked_content: 'true',
            });
    }

    getUserAllMedia(args, options) {
        return this._paginate(this.getUserRecentMedia, args, options);
    }

    usersSearch({q = '', count = 10} = {}) {
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
    getSelfFollows(query = {}) {

        return this.getUserFollows(this.account_id, query);
    }

    getSelfAllFollows(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 0) {
            args.push({});
        }

        return this._paginate(this.getSelfFollows, args, options);
    }

    getSelfFollowsStream(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 0) {
            args.push({});
        }

        return this._stream(this.getSelfFollows, args, options);
    }

    getUserFollows(userID, query = {}) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if(!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        query.rank_token = this.rank_token;

        return this._request(`/friendships/${userID}/following/`).setQuery(query);
    }

    getUserAllFollows(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 1) {
            args.push({});
        }

        return this._paginate(this.getUserFollows, args, options);
    }

    getUserFollowsStream(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 1) {
            args.push({});
        }

        return this._stream(this.getUserFollows, args, options);
    }

    // followers
    getSelfFollowedBy(query = {}) {

        return this.getUserFollowers(this.account_id, query);
    }

    getSelfFollowers = this.getSelfFollowedBy;

    getSelfAllFollowedBy(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 0) {
            args.push({});
        }

        return this._paginate(this.getSelfFollowedBy, args, options);
    }

    getSelfAllFollowers = this.getSelfAllFollowedBy;

    getSelfFollowersStream(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 0) {
            args.push({});
        }

        return this._stream(this.getSelfFollowedBy, args, options);
    }

    getUserFollowers(userID, query = {}) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        query.rank_token = this.rank_token;

        return this._request(`/friendships/${userID}/followers/`).setQuery(query);
    }

    getUserAllFollowers(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 1) {
            args.push({});
        }

        return this._paginate(this.getUserFollowers, args, options);
    }

    getUserFollowersStream(args, options) {
        options.paginationProp = 'max_id';
        options.dataProp = 'users';

        if(args.length === 1) {
            args.push({});
        }

        return this._stream(this.getUserFollowers, args, options);
    }

    getUserRelationship(userID) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        // {"status":"ok","incoming_request":false,"outgoing_request":false,"following":false,"followed_by":false,"blocking":false,"is_private":false}

        return this._request(`/friendships/show/${userID}/`);
    }

    getUsersRelationships(usersIDS) {
        if(!usersIDS || !usersIDS.length) {
            throw new Error('Argument `usersIDS` is required and must be not empty.');
        }

        // test/fixtures/friendshipsMany.json

        return this._request('/friendships/show_many/')
            .setMethod('POST')
            .setBody({
                user_ids: usersIDS.join(','),
                _uuid: this.uuid,
                _csrftoken: this.token
            });
    }

    followUser(userID) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if(!this.isLoggedIn) {
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

    unFollowUser(userID) {
        if(!userID) {
            throw new Error('Argument `userID` is required.');
        }

        if(!this.isLoggedIn) {
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

    getMediaInfoById(mediaID) {
        if(!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        if(!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        return this._request(`/media/${mediaID}/info/`);
    }

    getCommentsForMedia(mediaID, maxId = null) {
        if(!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        if(!this.isLoggedIn) {
            throw new Error('You must be logged in.');
        }

        // test/fixtures/mediaComments.json

        return this._request(`/media/${mediaID}/comments/`)
            .setBody({
                ig_sig_key_version: Constants.IG_SIG_KEY,
                max_id: maxId,
            });
    }

    getLikesForMedia(mediaID) {
        if(!mediaID) {
            throw new Error('Argument `mediaID` is required.');
        }

        // test/fixtures/likers.json

        return this._request(`/media/${mediaID}/likers/`);
    }

    addLikeForMedia(mediaID) {
        if(!mediaID) {
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

    removeLikeForMedia(mediaID) {
        if(!mediaID) {
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

    tagsSearch(q = '', count = 20) {
        return this._request('/tags/search/').setQuery({q, count, rank_token: this.rank_token});
    }

    _request(url = '/users/self') {
        return new Request(this, url);
    }
}

module.exports = InstagramSDK;
