
import fs from 'fs';
import util from 'util';
import crypto from 'crypto';
import {Readable as Readable} from 'stream';

import Promise from 'bluebird';
import uuid from 'node-uuid';
import request from 'request';
import FileCookieStore from 'tough-cookie-filestore';
import _ from 'lodash';

import logger from '../lib/logger';
import * as constants from './constants';

class InstagramSDK {
  instagramHost = 'i.instagram.com';
  apiPath = '/api/v1';

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
                if(data.status == 'fail') {
                  throw new Error(data.message);
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

    return this.getUser(this.usernameId);
  }

  getSelfRecentMedia({count = 10, min_id = undefined, max_id = undefined} = {}) {
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
              if(resp.status != 'ok') {
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
              logger.critical('trace', err);
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
        rs.emit('error', err);
      });
    };

    request(null);
    return rs;
  }

  getSelfAllMedia(args, {timeout = 0} = {}) {
    return new Promise((resolve, reject) => {
      var data = [],
          request = (max_id, cb) => {
            args[0]['max_id'] = max_id;

            this.getSelfRecentMedia.call(this, ...args).then((resp) => {
              if(resp.status != 'ok') {
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
              logger.critical('trace', err);
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

    // test/fixtures/userFeed.json
    return this._request({path: `/feed/user/${userID}/`, query: {count, min_id, max_id}}).then(this._parseJSON.bind(this));
  }

  getUserAllMedia(args, options) {
    return this._paginate(this.getUserRecentMedia, args, options);
  }

  usersSearch({q = '', count = 10} = {}) {
    // test/fixtures/usersSearch.json
    return this._request({path: '/users/search/', query: {q, count, rank_token: this.rankToken}}).then(this._parseJSON.bind(this));
  }

  //////////////////////////
  //// Relationships
  //////////////////////////

  // followed
  getSelfFollows(query = {}) {
    return this.getUserFollows(this.usernameId, query);
  }

  getSelfAllFollows(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    return this._paginate(this.getSelfFollows, args, options);
  }

  getSelfFollowsStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
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

    query.rank_token = this.rankToken;

    return this._request({path: `/friendships/${userID}/following/`, query}).then(this._parseJSON.bind(this));
  }

  getUserAllFollows(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    return this._paginate(this.getUserFollows, args, options);
  }

  getUserFollowsStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    return this._stream(this.getUserFollows, args, options);
  }

  // followers
  getSelfFollowedBy(query = {}) {
    return this.getUserFollowers(this.usernameId, query);
  }

  getSelfFollowers = this.getSelfFollowedBy;

  getSelfAllFollowedBy(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    return this._paginate(this.getSelfFollowedBy, args, options);
  }

  getSelfAllFollowers = this.getSelfAllFollowedBy;

  getSelfFollowersStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 0) {
      args.push({});
    }

    return this._stream(this.getSelfFollowedBy, args, options);
  }

  getUserFollowers(userID, query = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    query.rank_token = this.rankToken;

    return this._request({path: `/friendships/${userID}/followers/`, query}).then(this._parseJSON.bind(this));
  }

  getUserAllFollowers(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    return this._paginate(this.getUserFollowers, args, options);
  }

  getUserFollowersStream(args, options) {
    options.paginationProp = 'max_id';
    options.dataProp = 'users';

    if(args.length == 1) {
      args.push({});
    }

    return this._stream(this.getUserFollowers, args, options);
  }

  getUserRelationship(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    // {"status":"ok","incoming_request":false,"outgoing_request":false,"following":false,"followed_by":false,"blocking":false,"is_private":false}
    return this._request({path: `/friendships/show/${userID}/`}).then(this._parseJSON.bind(this));
  }

  getUsersRelationships(usersIDS) {
    if(!usersIDS || !usersIDS.length) {
      throw new Error('Argument `usersIDS` is required and must be not empty.');
    }

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

    return this._request({path: `/media/${mediaID}/info/`}).then(this._parseJSON.bind(this));
  }

  getCommentsForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!this.isLoggedIn) {
      throw new Error('You must be logged in.');
    }

    // test/fixtures/mediaComments.json
    return this._request({path: `/media/${mediaID}/comments/`}).then(this._parseJSON.bind(this));
  }

  getLikesForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    // test/fixtures/likers.json
    return this._request({path: `/media/${mediaID}/likers/`}).then(this._parseJSON.bind(this));
  }

  addLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

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
      return Promise.resolve({});
    }

    try {
      resJSON = JSON.parse(resData);
    } catch(err) {
      logger.debug('_parseJSON: invalid response:', resData);
      return Promise.reject(new Error('Invalid JSON response:' + resData));
    }

    if(resJSON.message == 'login_required' && this.failsCount < 3) {
      this.failsCount++;
      return this.login(true).then(() => {
        return this._request(this.last_requestArgs).then(this._parseJSON.bind(this));
      });
    }

    this.failsCount = 0;

    logger.debug('_parseJSON: response: %.-500s', util.inspect(resJSON));
    return Promise.resolve(resJSON);
  }

  static _normalizeQueryParams(query) {
    let out = {};
    for(let i in query) {
      if(query.hasOwnProperty(i)) {
        if(query[i] !== undefined && query[i] !== null) {
          out[i] = query[i];
        }
      }
    }

    return out;
  }

  _request({method = 'GET', path = '/users/self', postData, query = {}} = {}) {
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

      if(this.proxy) {
        requestOptions.proxy = `http://${this.proxy.ip}:${this.proxy.port}`;
      }

      if(postData) {
        requestOptions.form = postData;
        logger.debug('_request: request with postData: %:2j', postData);
      }

      requestOptions.headers = headers;
      logger.debug('_request: request with params: %:2j', _.omit(requestOptions, ['jar']));

      // this.lastRequestOptions = requestOptions;
      this.last_requestArgs = {method, path, postData, query};

      var requester = request[method.toLowerCase()];

      requester(requestOptions, (err, res, resData) => {
        if(err) {
          return reject(err);
        }

        logger.debug('_request: response statusCode:', res.statusCode);
        resolve({res, resData});
      });
    });
  }

}

export default InstagramSDK;
