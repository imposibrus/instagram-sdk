
import fs from 'fs';
import util from 'util';
// import url from 'url';
import crypto from 'crypto';
import {Readable as Readable} from 'stream';

import Promise from 'bluebird';
import uuid from 'node-uuid';
import request from 'request';
import FileCookieStore from 'tough-cookie-filestore';
import _ from 'lodash';
// import cheerio from 'cheerio';

import _logger from '../lib/logger';
import * as constants from './constants';
import CustomError from '../lib/CustomError';

const logger = _logger.getLogger('instagram-sdk');

class InstagramSDK {
  instagramHost = 'i.instagram.com';
  apiPath = '/api/v1';
  _requestId = InstagramSDK.generateUUID();

  constructor(username, password, cookiesFilePath, options = {}) {

    if(!username || !password || !cookiesFilePath) {
      throw new Error('You must specify both `username`, `password` and `cookiesFilePath`.');
    }

    this.isLoggedIn = false;

    this.username = username;
    this.password = password;

    this.cookiesFilePath = cookiesFilePath;

    if(!fs.existsSync(this.cookiesFilePath)) {
      fs.writeFileSync(this.cookiesFilePath, '');
    }

    this.jar = request.jar(new FileCookieStore(this.cookiesFilePath));

    var allowedOptions = new Set(['deviceId', 'uuid', 'CSRFToken', 'isLoggedIn', 'usernameId', 'rankToken']);

    this.failsCount = 0;

    this.uuid = InstagramSDK.generateUUID();
    this.deviceId = InstagramSDK.generateDeviceId();

    if(options) {
      for(let key in options) {
        if(options.hasOwnProperty(key) && allowedOptions.has(key)) {
          this[key] = options[key];
        }
      }
    }
  }

  //////////////////////////
  //// Helpers
  //////////////////////////

  static generateUUID(hyphens = true) {
    let UUID = uuid.v4();

    if(!hyphens) {
      return UUID.replace(/-/g, '');
    }

    return UUID;
  }

  static generateDeviceId() {
    return 'android-' + crypto.randomBytes(8).toString('hex');
  }

  static generateSignature(data) {
    let json = JSON.stringify(data),
        hash = crypto.createHmac('SHA256', constants.IG_SIG_KEY).update(json).digest('hex');

    return {
      ig_sig_key_version: constants.SIG_KEY_VERSION,
      signed_body: `${hash}.${json}`
    };
  }

  extractCSRFToken({res}) {
    let cookies = this.jar.getCookies(res.request.href),
        CSRFCookie = _.find(cookies, {key: 'csrftoken'});

    if(!CSRFCookie) {
      this.CSRFToken = 'missing';
      return res;
    }

    this.CSRFToken = CSRFCookie.value;
  }

  //////////////////////////
  //// Auth
  //////////////////////////

  login(force = false) {
    if(this.isLoggedIn && !force) {
      return Promise.resolve(this);
    }

    return this._request({
          path: '/si/fetch_headers/',
          query: {
            challenge_type: 'signup',
            guid: InstagramSDK.generateUUID(false)
          }
        })
        .tap(this.extractCSRFToken.bind(this))
        .then(() => {
          var postData = {
                device_id: this.deviceId,
                guid: this.uuid,
                username: this.username,
                password: this.password,
                csrftoken: this.CSRFToken,
                login_attempt_count: '0'
              };

          return this._request({method: 'POST', path: '/accounts/login/', postData: InstagramSDK.generateSignature(postData)})
              .tap(this.extractCSRFToken.bind(this))
              .then(this._parseJSON.bind(this))
              .then((data) => {
                if(data.status == 'fail' || (_.isObject(data.errors) && !_.isEmpty(data.errors))) {
                  throw new LoginError(data.message || data.errors || data);
                }

                this.isLoggedIn = true;
                this.usernameId = data.logged_in_user.pk;
                this.rankToken = `${this.usernameId}_${this.uuid}`;

                return {
                  deviceId: this.deviceId,
                  uuid: this.uuid,
                  CSRFToken: this.CSRFToken,
                  isLoggedIn: this.isLoggedIn,
                  usernameId: this.usernameId,
                  rankToken: this.rankToken
                };
              });
        });
  }

  checkUsername(username) {
    if(!username) {
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

    return this._request({
      method: 'POST',
      path: '/users/check_username/',
      postData: InstagramSDK.generateSignature({
        _uuid: this.uuid,
        username: username,
        _csrftoken: 'missing'
      })
    }).then(this._parseJSON.bind(this));
  }

  //////////////////////////
  //// Users
  //////////////////////////
  getSelf() {
    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    logger.debug(`(${this._requestId}) getSelf ${this.usernameId}`);
    return this.getUser(this.usernameId);
  }

  getSelfRecentMedia({count = 10, min_id = undefined, max_id = undefined} = {}) {
    logger.debug(`(${this._requestId}) getSelfRecentMedia ${this.usernameId}`);
    return this.getUserRecentMedia(this.usernameId, {count, min_id, max_id});
  }

  _paginate(method = this.getSelfRecentMedia, methodArgs = [], {timeout = 0, paginationProp = 'max_id', dataProp = 'items'} = {}) {
    return new Promise((resolve, reject) => {
      var data = [],
          request = (max_id, cb) => {
            if(methodArgs.length == 1) {
              methodArgs[0][paginationProp] = max_id;
            } else {
              var lastArg = methodArgs.slice(-1)[0];
              lastArg[paginationProp] = max_id;
              methodArgs.splice(-1, 1, lastArg);
            }

            method.call(this, ...methodArgs).then((resp) => {
              if(resp.status != 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                logger.critical('trace', resp, `(${this._requestId})`);
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
              logger.critical('trace', err, `(${this._requestId})`);
              reject(err);
            });
          };

      request(null, resolve);
    });
  }

  _stream(method = this.getSelfRecentMedia, methodArgs = [], {timeout = 0, paginationProp = 'max_id', dataProp = 'items'} = {}) {
    var rs = new Readable({
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

    var request = (max_id) => {
      if(methodArgs.length == 1) {
        methodArgs[0][paginationProp] = max_id;
      } else {
        var lastArg = methodArgs.slice(-1)[0];
        lastArg[paginationProp] = max_id;
        methodArgs.splice(-1, 1, lastArg);
      }

      method.call(this, ...methodArgs).then((resp) => {
        var items = resp[dataProp];

        if(resp.status != 'ok' || !_.isArray(items)) {
          logger.critical('trace', resp, `(${this._requestId})`);
          return rs.emit('error', new Error('Invalid response: ' + JSON.stringify(resp)));
        }

        for(var i = 0; i < items.length; i++) {
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
        logger.critical('trace', err);
        rs.emit('error', err, `(${this._requestId})`);
      });
    };

    request(null);
    return rs;
  }

  getSelfAllMedia(args, {timeout = 0} = {}) {
    logger.debug(`(${this._requestId}) getSelfAllMedia %:2j`, args);
    return new Promise((resolve, reject) => {
      var data = [],
          request = (max_id, cb) => {
            args[0]['max_id'] = max_id;

            this.getSelfRecentMedia.call(this, ...args).then((resp) => {
              if(resp.status != 'ok' || (_.isObject(resp.errors) && !_.isEmpty(resp.errors))) {
                logger.critical('trace', resp, `(${this._requestId})`);
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
              logger.critical('trace', err, `(${this._requestId})`);
              reject(err);
            });
          };

      request(null, resolve);
    });
  }

  getUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    logger.debug(`(${this._requestId}) getUser ${userID}`);
    // test/fixtures/userInfo.json
    return this._request({path: `/users/${userID}/info/`}).then(this._parseJSON.bind(this));
  }

  getUserRecentMedia(userID, {count = 10, min_id = undefined, max_id = undefined} = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    logger.debug(`(${this._requestId}) getUserRecentMedia ${userID}`);
    // test/fixtures/userFeed.json
    return this._request({path: `/feed/user/${userID}/`, query: {count, min_id, max_id}}).then(this._parseJSON.bind(this));
  }

  getUserAllMedia(args, options) {
    logger.debug(`(${this._requestId}) getUserAllMedia %:2j`, args);
    return this._paginate(this.getUserRecentMedia, args, options);
  }

  usersSearch({q = '', count = 10} = {}) {
    logger.debug(`(${this._requestId}) usersSearch ${q}`);
    // test/fixtures/usersSearch.json
    return this._request({path: '/users/search/', query: {q, count, rank_token: this.rankToken}}).then(this._parseJSON.bind(this));
  }

  //////////////////////////
  //// Relationships
  //////////////////////////

  // followed
  getSelfFollows(query = {}) {
    logger.debug(`(${this._requestId}) getSelfFollows %:2j`, query);
    return this.getUserFollows(this.usernameId, query);
  }

  getSelfAllFollows(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getSelfAllFollows %:2j %:2j`, args, options);
    return this._paginate(this.getSelfFollows, args, options);
  }

  getSelfFollowsStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getSelfFollowsStream %:2j %:2j`, args, options);
    return this._stream(this.getSelfFollows, args, options);
  }

  getUserFollows(userID, query = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    query.rank_token = this.rankToken;

    logger.debug(`(${this._requestId}) getUserFollows ${userID} %:2j`, query);
    return this._request({path: `/friendships/${userID}/following/`, query}).then(this._parseJSON.bind(this));
  }

  getUserAllFollows(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getUserAllFollows %:2j %:2j`, args, options);
    return this._paginate(this.getUserFollows, args, options);
  }

  getUserFollowsStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getUserFollowsStream %:2j %:2j`, args, options);
    return this._stream(this.getUserFollows, args, options);
  }

  // followers
  getSelfFollowedBy(query = {}) {
    logger.debug(`(${this._requestId}) getSelfFollowedBy %:2j`, query);
    return this.getUserFollowers(this.usernameId, query);
  }

  getSelfFollowers = this.getSelfFollowedBy;

  getSelfAllFollowedBy(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getSelfAllFollowedBy %:2j %:2j`, args, options);
    return this._paginate(this.getSelfFollowedBy, args, options);
  }

  getSelfAllFollowers = this.getSelfAllFollowedBy;

  getSelfFollowersStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getSelfFollowersStream %:2j %:2j`, args, options);
    return this._stream(this.getSelfFollowedBy, args, options);
  }

  getUserFollowers(userID, query = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    query.rank_token = this.rankToken;

    logger.debug(`(${this._requestId}) getUserFollowers ${userID} %:2j`, query);
    return this._request({path: `/friendships/${userID}/followers/`, query}).then(this._parseJSON.bind(this));
  }

  getUserAllFollowers(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getUserAllFollowers %:2j %:2j`, args, options);
    return this._paginate(this.getUserFollowers, args, options);
  }

  getUserFollowersStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    logger.debug(`(${this._requestId}) getUserFollowersStream %:2j %:2j`, args, options);
    return this._stream(this.getUserFollowers, args, options);
  }

  getUserRelationship(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    logger.debug(`(${this._requestId}) getUserRelationship ${userID}`);
    // {"status":"ok","incoming_request":false,"outgoing_request":false,"following":false,"followed_by":false,"blocking":false,"is_private":false}
    return this._request({path: `/friendships/show/${userID}/`}).then(this._parseJSON.bind(this));
  }

  getUsersRelationships(usersIDS) {
    if(!usersIDS || !usersIDS.length) {
      throw new Error('Argument `usersIDS` is required and must be not empty.');
    }

    logger.debug(`(${this._requestId}) getUsersRelationships %:2j`, usersIDS);
    // test/fixtures/friendshipsMany.json
    return this._request({
      method: 'POST',
      path: '/friendships/show_many/',
      postData: {
        user_ids: usersIDS.join(','),
        _uuid: this.uuid,
        _csrftoken: this.CSRFToken
      }
    }).then(this._parseJSON.bind(this));
  }

  followUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    logger.debug(`(${this._requestId}) followUser ${userID}`);
    return this._request({
      method: 'POST',
      path: `/friendships/create/${userID}/`,
      postData: InstagramSDK.generateSignature({
        _uuid: this.uuid,
        _uid: this.usernameId,
        user_id: userID,
        _csrftoken: this.CSRFToken
      })
    }).then(this._parseJSON.bind(this));
  }

  unFollowUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    logger.debug(`(${this._requestId}) unFollowUser ${userID}`);
    return this._request({
      method: 'POST',
      path: `/friendships/destroy/${userID}/`,
      postData: InstagramSDK.generateSignature({
        _uuid: this.uuid,
        _uid: this.usernameId,
        user_id: userID,
        _csrftoken: this.CSRFToken
      })
    }).then(this._parseJSON.bind(this));
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

    logger.debug(`(${this._requestId}) getMediaInfoById ${mediaID}`);
    return this._request({path: `/media/${mediaID}/info/`}).then(this._parseJSON.bind(this));
  }

  getCommentsForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    logger.debug(`(${this._requestId}) getCommentsForMedia ${mediaID}`);
    // test/fixtures/mediaComments.json
    return this._request({path: `/media/${mediaID}/comments/`}).then(this._parseJSON.bind(this));
  }

  getLikesForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    logger.debug(`(${this._requestId}) getLikesForMedia ${mediaID}`);
    // test/fixtures/likers.json
    return this._request({path: `/media/${mediaID}/likers/`}).then(this._parseJSON.bind(this));
  }

  addLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    logger.debug(`(${this._requestId}) addLikeForMedia ${mediaID}`);
    // {"status":"ok"}
    return this._request({
      method: 'POST',
      path: `/media/${mediaID}/like/`,
      postData: InstagramSDK.generateSignature({
        _uuid: this.uuid,
        _uid: this.usernameId,
        _csrftoken: this.CSRFToken,
        media_id: mediaID
      })
    }).then(this._parseJSON.bind(this));
  }

  removeLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    logger.debug(`(${this._requestId}) removeLikeForMedia ${mediaID}`);
    // {"status":"ok"}
    return this._request({
      method: 'POST',
      path: `/media/${mediaID}/unlike/`,
      postData: InstagramSDK.generateSignature({
        _uuid: this.uuid,
        _uid: this.usernameId,
        _csrftoken: this.CSRFToken,
        media_id: mediaID
      })
    }).then(this._parseJSON.bind(this));
  }

  tagsSearch(q = '', count = 20) {
    logger.debug(`(${this._requestId}) tagsSearch ${q}`);
    return this._request({path: '/tags/search/', query: {q, count, rank_token: this.rankToken}}).then(this._parseJSON.bind(this));
  }

  _getHeaderValue(headerName) {
    return ({res} = {}) => {
      return Promise.resolve(res.headers[headerName]);
    };
  }

  _parseJSON({res, resData} = {}) {
    var resJSON = {};

    if(res.statusCode == 204) {
      logger.debug(`(${this._requestId}) _parseJSON: empty response`);
      return Promise.resolve({});
    }

    try {
      resJSON = JSON.parse(resData);
    } catch(err) {
      logger.debug(`(${this._requestId}) _parseJSON: invalid response:`, resData);
      return Promise.reject(new Error('Invalid JSON response:' + resData));
    }

    if(resJSON.message == 'login_required' && this.failsCount < 3) {
      logger.debug(`(${this._requestId}) _parseJSON: 'login_required', try again:`, resJSON);
      this.failsCount++;
      return this.login(true).then(() => {
        return this._request(this.last_requestArgs).then(this._parseJSON.bind(this));
      });
    }

    // if(resJSON.message == 'checkpoint_required' && this.failsCount < 1) {
    //   this.failsCount++;
    //   return this._request({method: 'GET', path: resJSON.checkpoint_url, options: {isAbsolute: true}})
    //       .then(this._parseCheckpointForm.bind(this));
    // }

    this.failsCount = 0;

    logger.debug(`(${this._requestId}) _parseJSON: response: %.-500s`, util.inspect(resJSON));
    return Promise.resolve(resJSON);
  }

  static _normalizeQueryParams(query) {
    let out = {};
    for(let i in query) {
      if(Object.prototype.hasOwnProperty.call(query, i)) {
        if(query[i] !== undefined && query[i] !== null) {
          out[i] = query[i];
        }
      }
    }

    return out;
  }

  // _parseCheckpointForm({res, resData} = {}) {
  //   var $ = cheerio.load(resData),
  //       $form = $('form'),
  //       url = $form.attr('action'),
  //       fields = $form.serializeArray(),
  //       postData = {};
  //
  //   fields.forEach((field) => {
  //     postData[field.name] = field.value;
  //   });
  //
  //   return this._request({method: 'POST', path: url, postData, options: {isAbsolute: true}}).then(({res, resData} = {}) => {
  //     console.log('resData', resData);
  //     /*
  //       Code: 403
  //       <h2>Error</h2>
  //       <p>This page could not be loaded. If you have cookies disabled in your browser,
  //         or you are browsing in Private Mode, please try enabling cookies or turning off
  //         Private Mode, and then retrying your action.</p>
  //      * */
  //   });
  // }

  _request({method = 'GET', path = '/users/self', postData, query = {}/*, options = {}*/} = {}) {
    return new Promise((resolve, reject) => {
      let headers = {
            'User-Agent': constants.USER_AGENT,
            'X-IG-Connection-Type': 'WIFI',
            'X-IG-Capabilities': 'nQ==',
            'Cookie2': '$Version=1'
          },
          requestOptions = {
            baseUrl: `https://${this.instagramHost + this.apiPath}`,
            url: path,
            qs: InstagramSDK._normalizeQueryParams(query),
            method,
            jar: this.jar,
            timeout: 5000
          };

      // if(options.isAbsolute) {
      //   let parsedUrl = url.parse(path, true);
      //   logger.debug('_request: absolute parsedUrl: %:2j', parsedUrl);
      //   console.log(typeof parsedUrl.query, parsedUrl.query, parsedUrl.query.hasOwnProperty);
      //   requestOptions.baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      //   requestOptions.url = parsedUrl.pathname;
      //   requestOptions.qs = InstagramSDK._normalizeQueryParams(parsedUrl.query);
      //   logger.debug(`(${this._requestId}) _request: absolute requestOptions: %:2j`, _.omit(requestOptions, ['jar']));
      // }

      if(this.proxy) {
        requestOptions.proxy = `http://${this.proxy.ip}:${this.proxy.port}`;
        logger.debug(`(${this._requestId}) _request: using proxy: ${requestOptions.proxy}`);
      }

      if(postData) {
        requestOptions.form = postData;
        logger.debug(`(${this._requestId}) _request: request with postData: %:2j`, postData);
      }

      requestOptions.headers = headers;
      logger.debug(`(${this._requestId}) _request: request with params: %:2j`, _.omit(requestOptions, ['jar']));

      // this.lastRequestOptions = requestOptions;
      this.last_requestArgs = {method, path, postData, query};

      var requester = request[method.toLowerCase()];

      requester(requestOptions, (err, res, resData) => {
        if(err) {
          return reject(err);
        }

        logger.debug(`(${this._requestId}) _request: response statusCode:`, res.statusCode);
        resolve({res, resData});
      });
    });
  }

  regenerateRequestId() {
    this._requestId = InstagramSDK.generateUUID();
  }
}

export default InstagramSDK;

export var LoginError = CustomError('LoginError');
