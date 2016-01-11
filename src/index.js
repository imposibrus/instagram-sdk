
import fs from 'fs';
import https from 'https';
import querystring from 'querystring';
import util from 'util';
import crypto from 'crypto';

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

  constructor(username, password, cookiesFilePath) {

    if(!username || !password) {
      throw new Error('You must specify both `username` and `password`.');
    }

    this.isLoggedIn = false;

    this.username = username;
    this.password = password;

    this.cookiesFilePath = cookiesFilePath;

    if(!fs.existsSync(cookiesFilePath)) {
      fs.writeFileSync(cookiesFilePath, '');
    }

    this.jar = request.jar(new FileCookieStore(cookiesFilePath));

    this.uuid = this.generateUUID();
    this.deviceId = this.generateDeviceId();
  }

  generateUUID(hyphens = true) {
    let UUID = uuid.v4();

    if(!hyphens) {
      return UUID.replace('-', '');
    }

    return UUID;
  }

  generateDeviceId() {
    return 'android-' + crypto.randomBytes(8).toString('hex');
  }

  generateSignature(data) {
    let json = JSON.stringify(data),
        hash = crypto.createHmac('SHA256', constants.IG_SIG_KEY).update(json).digest('hex');

    return {
      ig_sig_key_version: constants.SIG_KEY_VERSION,
      signed_body: `${hash}.${encodeURIComponent(json)}`
    };
  }

  //////////////////////////
  //// Auth
  //////////////////////////

  login() {
    return this._request({
          path: '/si/fetch_headers/',
          query: {
            challenge_type: 'signup',
            guid: this.generateUUID(false)
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

          return this._request({method: 'POST', path: '/accounts/login/', postData: this.generateSignature(postData)})
              .tap(this.extractCSRFToken.bind(this))
              .then(this._parseJSON)
              .then((data) => {
                if(data.status == 'fail') {
                  throw new Error(data.message);
                }

                this.isLoggedIn = true;
                this.usernameId = data.logged_in_user.pk;
                this.rankToken = `${this.usernameId}_${this.uuid}`;

                return true;
              });
        });
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

  requestAccessToken(redirect_uri, code) {
    if(!redirect_uri || !code) {
      throw new Error('You must specify both of `redirect_uri` and `code` parameters.');
    }

    return this._oAuth({path: '/access_token', postData: {
      client_id: this.clientID,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri,
      code
    }}).then(this._parseJSON);
  }

  //////////////////////////
  //// Users
  //////////////////////////
  getSelf() {
    return this._request().then(this._parseJSON);
  }

  getSelfRecentMedia({count = 10, min_id = undefined, max_id = undefined} = {}) {
    return this._request({path: '/users/self/media/recent', query: {count, min_id, max_id}}).then(this._parseJSON);
  }

  _paginate(method = this.getSelfRecentMedia, methodArgs = [], {timeout = 0, paginationProp = 'max_id'} = {}) {
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
              if(!resp.meta || resp.meta.code != 200) {
                return reject('Invalid response: ' + JSON.stringify(resp));
              }

              data = data.concat(resp.data);
              if(resp.pagination && resp.pagination['next_' + paginationProp]) {
                setTimeout(() => {
                  request(resp.pagination['next_' + paginationProp], cb);
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

  getSelfAllMedia(args, options) {
    return this._paginate(this.getSelfRecentMedia, args, options);
  }

  getSelfRecentLikes({count = 10, max_like_id = undefined} = {}) {
    return this._request({path: '/users/self/media/liked', query: {count, max_like_id}}).then(this._parseJSON);
  }

  getSelfAllLikes(args, options) {
    options.paginationProp = 'max_like_id';
    return this._paginate(this.getSelfRecentLikes, args, options);
  }

  getUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: '/users/' + userID}).then(this._parseJSON);
  }

  getUserRecentMedia(userID, {count = 10, min_id = undefined, max_id = undefined} = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/media/recent`, query: {count, min_id, max_id}}).then(this._parseJSON);
  }

  getUserAllMedia(args, options) {
    return this._paginate(this.getUserRecentMedia, args, options);
  }

  usersSearch({q = '', count = 10} = {}) {
    return this._request({path: '/users/search', query: {q, count}}).then(this._parseJSON);
  }

  //////////////////////////
  //// Relationships
  //////////////////////////

  // followed
  getSelfFollows(query = {}) {
    return this._request({path: '/users/self/follows', query}).then(this._parseJSON);
  }

  getSelfAllFollows(args, options) {
    options.paginationProp = 'cursor';

    if(args.length == 0) {
      args.push({});
    }

    return this._paginate(this.getSelfFollows, args, options);
  }

  getUserFollows(userID, query = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/follows`, query}).then(this._parseJSON);
  }

  getUserAllFollows(args, options) {
    options.paginationProp = 'cursor';

    if(args.length == 1) {
      args.push({});
    }

    return this._paginate(this.getUserFollows, args, options);
  }

  // followers
  getSelfFollowedBy(query = {}) {
    return this._request({path: '/users/self/followed-by', query}).then(this._parseJSON);
  }

  getSelfAllFollowedBy(args, options) {
    options.paginationProp = 'cursor';

    if(args.length == 0) {
      args.push({});
    }

    return this._paginate(this.getSelfFollowedBy, args, options);
  }

  getUserFollowedBy(userID, query = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/followed-by`, query}).then(this._parseJSON);
  }

  getUserAllFollowedBy(args, options) {
    options.paginationProp = 'cursor';

    if(args.length == 1) {
      args.push({});
    }

    return this._paginate(this.getUserFollowedBy, args, options);
  }

  getSelfRequestedBy() {
    return this._request({path: '/users/self/requested-by'}).then(this._parseJSON);
  }

  getUserRelationship(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/relationship`}).then(this._parseJSON);
  }

  updateUserRelationship(userID, action) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!action) {
      throw new Error('Argument `action` is required.');
    }

    return this._request({method: 'POST', path: `/users/${userID}/relationship`, postData: {action}}).then(this._parseJSON);
  }

  //////////////////////////
  //// Media
  //////////////////////////

  getMediaInfoById(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}`}).then(this._parseJSON);
  }

  getMediaInfoByShortCode(shortCode) {
    if(!shortCode) {
      throw new Error('Argument `shortCode` is required.');
    }

    return this._request({path: `/media/shortcode/${shortCode}`}).then(this._parseJSON);
  }

  mediaSearch({lat = 0, lng = 0, distance = 10} = {}) {
    return this._request({path: '/media/search', query: {lat, lng, distance}}).then(this._parseJSON);
  }

  //////////////////////////
  //// Comments
  //////////////////////////

  getCommentsForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}/comments`}).then(this._parseJSON);
  }

  addCommentForMedia(mediaID, text) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!text) {
      throw new Error('Argument `text` is required.');
    }

    return this._request({method: 'POST', path: `/media/${mediaID}/comments`, postData: {text}}).then(this._parseJSON);
  }

  removeCommentForMedia(mediaID, commentId) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!commentId) {
      throw new Error('Argument `commentId` is required.');
    }

    return this._request({method: 'DELETE', path: `/media/${mediaID}/comments/${commentId}`}).then(this._parseJSON);
  }

  //////////////////////////
  //// Likes
  //////////////////////////

  getLikesForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}/likes`}).then(this._parseJSON);
  }

  addLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({method: 'POST', path: `/media/${mediaID}/likes`}).then(this._parseJSON);
  }

  removeLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({method: 'DELETE', path: `/media/${mediaID}/likes`}).then(this._parseJSON);
  }

  //////////////////////////
  //// Tags
  //////////////////////////

  getTagInfoByTagName(tagName) {
    if(!tagName) {
      throw new Error('Argument `tagName` is required.');
    }

    return this._request({path: `/tags/${tagName}`}).then(this._parseJSON);
  }

  getRecentMediaForTagName(tagName, {count = 10, min_tag_id = undefined, max_tag_id = undefined} = {}) {
    if(!tagName) {
      throw new Error('Argument `tagName` is required.');
    }

    return this._request({path: `/tags/${tagName}/media/recent`, query: {count, min_tag_id, max_tag_id}}).then(this._parseJSON);
  }

  getAllMediaForTagName(args, options) {
    options.paginationProp = 'max_tag_id';
    return this._paginate(this.getRecentMediaForTagName, args, options);
  }

  tagsSearch(q = '') {
    return this._request({path: '/tags/search', query: {q}}).then(this._parseJSON);
  }

  //////////////////////////
  //// Locations
  //////////////////////////

  getLocationInfoByLocationId(locationId) {
    if(!locationId) {
      throw new Error('Argument `locationId` is required.');
    }

    return this._request({path: `/locations/${locationId}`}).then(this._parseJSON);
  }

  getRecentMediaForLocationId(locationId, {count = 10, min_id = undefined, max_id = undefined} = {}) {
    if(!locationId) {
      throw new Error('Argument `locationId` is required.');
    }

    return this._request({path: `/locations/${locationId}/media/recent`, query: {count, min_id, max_id}}).then(this._parseJSON);
  }

  getAllMediaForLocationId(args, options) {
    options.paginationProp = 'max_id';
    return this._paginate(this.getRecentMediaForLocationId, args, options);
  }

  locationsSearch({
      distance = 1000,
      facebook_places_id = undefined,
      foursquare_id = undefined,
      lat = undefined,
      lng = undefined,
      foursquare_v2_id = undefined
      } = {}) {

    return this._request({
      path: '/locations/search',
      query: {
        distance,
        facebook_places_id,
        foursquare_id,
        lat,
        lng,
        foursquare_v2_id
      }
    }).then(this._parseJSON);
  }

  //////////////////////////
  //// Embedding
  //////////////////////////

  getMediaJPGByShortCode(shortCode) {
    if(!shortCode) {
      throw new Error('Argument `shortCode` is required.');
    }

    return this._request({path: `/p/${shortCode}/media`}).then(this._getHeaderValue('Location'));
  }

  //////////////////////////
  //// Subscriptions
  //////////////////////////

  addSubscription({object = undefined, aspect = undefined, verify_token = undefined, callback_url = undefined} = {}) {
    if(!object || !aspect || !callback_url) {
      throw new Error('Arguments `object`, `aspect` and `callback_url` is required.');
    }

    return this._request({
      method: 'POST',
      path: '/subscriptions',
      postData: {
        object,
        aspect,
        verify_token,
        callback_url,
        client_id: this.clientID,
        client_secret: this.clientSecret
      }
    }).then(this._parseJSON);
  }

  getSubscriptions() {
    return this._request({
      path: '/subscriptions',
      query: {
        client_id: this.clientID,
        client_secret: this.clientSecret
      }
    }).then(this._parseJSON);
  }

  removeSubscription({object = undefined, id = undefined} = {}) {
    return this._request({
      method: 'DELETE',
      path: '/subscriptions',
      query: {
        client_id: this.clientID,
        client_secret: this.clientSecret,
        object,
        id
      }
    }).then(this._parseJSON);
  }

  _getHeaderValue(headerName) {
    return ({res} = {}) => {
      return Promise.resolve(res.headers[headerName]);
    };
  }

  _parseJSON({res, resData} = {}) {
    console.log('_parseJSON called');
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

    logger.debug('_parseJSON: response: %.-500s', util.inspect(resJSON));
    return Promise.resolve(resJSON);
  }

  _normalizeQueryParams(query) {
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
      query.access_token = this.accessToken;
      let contentType = 'application/json',
          headers = {
            Accept: contentType,
            'User-Agent': constants.USER_AGENT
          },
          requestOptions = {
            baseUrl: `https://${this.instagramHost + this.apiPath}`,
            url: path,
            qs: this._normalizeQueryParams(query),
            method,
            jar: this.jar
          },
          _postData;

      if(postData) {
        _postData = JSON.stringify(postData);
        requestOptions.json = true;
        requestOptions.body = postData;
        //headers['Content-Type'] = 'application/json';
        //headers['Content-length'] = _postData.length;
        logger.debug('_request: request with postData: %:2j', _postData);
      }

      requestOptions.headers = headers;
      logger.debug('_request: request with params: %:2j', requestOptions);

      var req = request(requestOptions, (err, res, resData) => {
        if(err) {
          return reject(err);
        }

        // FIXME
        resData = typeof resData == 'object' ? JSON.stringify(resData) : resData;

        logger.debug('_request: response statusCode:', res.statusCode);
        resolve({res, resData});
      });
      console.log('req.headers', req.headers);
    });
  }

  _oAuth({method = 'POST', path = '/access_token', postData} = {}) {
    return new Promise((resolve, reject) => {
      let contentType = 'application/json',
          headers = {
            Accept: contentType
          },
          requestOptions = {
            hostname: this.instagramHost,
            path: `/oauth${path}`,
            method
          },
          _postData;

      if(postData) {
        _postData = querystring.stringify(postData);
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-length'] = _postData.length;
        logger.debug('_oAuth: request with postData: %:2j', _postData);
      }

      requestOptions.headers = headers;
      logger.debug('_oAuth: request with params: %:2j', requestOptions);

      var request = https.request(requestOptions, (res) => {
        var resData = '';

        res.on('data', (data) => {
          resData += data;
        });
        res.on('end', () => {
          logger.debug('_oAuth: response statusCode:', res.statusCode);
          resolve({res, resData});
        });
      }).on('error', reject);

      if(postData) {
        request.write(_postData);
      }

      request.end();
    });
  }
}

export default InstagramSDK;
