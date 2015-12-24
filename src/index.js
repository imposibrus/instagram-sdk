
import https from 'https';
import querystring from 'querystring';
import Promise from 'bluebird';
import logger from '../lib/logger';
import util from 'util';

class InstagramSDK {
  instagramHost = 'api.instagram.com';
  apiPath = '/v1';

  constructor({clientID = null, clientSecret = null, accessToken = null} = {}) {

    if(!clientID && !clientSecret && !accessToken) {
      throw new Error('You must specify on of: `accessToken` or both `clientID` and `clientSecret`.');
    }

    this.clientID = clientID;
    this.clientSecret = clientSecret;
    this.accessToken = accessToken;

    //if(!accessToken && (clientID && clientSecret)) {
    //  this.printLoginUrl();
    //} else if(accessToken) {
    //
    //}
  }

  //printLoginUrl() {
  //  console.log(`https://${this.instagramHost}/oauth/authorize/?client_id=${this.clientID}&redirect_uri=http://poster.loc&response_type=code`);
  //}


  //////////////////////////
  //// Auth
  //////////////////////////

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

  getSelfRecentLikes({count = 10, max_like_id = undefined} = {}) {
    return this._request({path: '/users/self/media/liked', query: {count, max_like_id}}).then(this._parseJSON);
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

  usersSearch({q = '', count = 10} = {}) {
    return this._request({path: '/users/search', query: {q, count}}).then(this._parseJSON);
  }

  //////////////////////////
  //// Relationships
  //////////////////////////

  getSelfFollows() {
    return this._request({path: '/users/self/follows'}).then(this._parseJSON);
  }

  getSelfFollowedBy() {
    return this._request({path: '/users/self/followed-by'}).then(this._parseJSON);
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

  getRecentMediaForLocationId(locationId, {min_tag_id = undefined, max_tag_id = undefined} = {}) {
    if(!locationId) {
      throw new Error('Argument `locationId` is required.');
    }

    return this._request({path: `/locations/${locationId}/media/recent`, query: {min_tag_id, max_tag_id}}).then(this._parseJSON);
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
        if(query[i] !== undefined) {
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
            Accept: contentType
          },
          requestOptions = {
            hostname: this.instagramHost,
            path: this.apiPath + path + '?' + querystring.stringify(this._normalizeQueryParams(query)),
            method
          },
          _postData;

      if(postData) {
        _postData = JSON.stringify(postData);
        headers['Content-Type'] = 'application/json';
        headers['Content-length'] = _postData.length;
        logger.debug('_request: request with postData: %:2j', _postData);
      }

      requestOptions.headers = headers;
      logger.debug('_request: request with params: %:2j', requestOptions);

      var request = https.request(requestOptions, (res) => {
        var resData = '';

        res.on('data', (data) => {
          resData += data;
        });
        res.on('end', () => {
          logger.debug('_request: rate limit:', res.headers['x-ratelimit-limit']);
          logger.debug('_request: rate limit remaining:', res.headers['x-ratelimit-remaining']);
          logger.debug('_request: response statusCode:', res.statusCode);
          resolve({res, resData});
        });
      }).on('error', reject);

      if(postData) {
        request.write(_postData);
      }

      request.end();
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
