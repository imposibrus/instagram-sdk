
import https from 'https';
import querystring from 'querystring';
import Promise from 'bluebird';
import logger from '../lib/logger';

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

    if(!accessToken && (clientID && clientSecret)) {
      this.printLoginUrl();
    } else if(accessToken) {

    }
  }

  printLoginUrl() {
    console.log(`https://${this.instagramHost}/oauth/authorize/?client_id=${this.clientID}&redirect_uri=http://poster.loc&response_type=code`);
  }


  //////////////////////////
  //// Users
  //////////////////////////
  getSelf() {
    return this._request();
  }

  getSelfRecentMedia({count = 10, min_id = undefined, max_id = undefined} = {}) {
    return this._request({path: '/users/self/media/recent', query: {count, min_id, max_id}});
  }

  getSelfRecentLikes({count = 10, max_like_id = undefined} = {}) {
    return this._request({path: '/users/self/media/liked', query: {count, max_like_id}});
  }

  getUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: '/users/' + userID});
  }

  getUserRecentMedia(userID, {count = 10, min_id = undefined, max_id = undefined} = {}) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/media/recent`, query: {count, min_id, max_id}});
  }

  usersSearch({q = '', count = 10} = {}) {
    return this._request({path: '/users/search', query: {q, count}});
  }

  //////////////////////////
  //// Relationships
  //////////////////////////

  getSelfFollows() {
    return this._request({path: '/users/self/follows'});
  }

  getSelfFollowedBy() {
    return this._request({path: '/users/self/followed-by'});
  }

  getSelfRequestedBy() {
    return this._request({path: '/users/self/requested-by'});
  }

  getUserRelationship(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/relationship`});
  }

  updateUserRelationship(userID, action) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    if(!action) {
      throw new Error('Argument `action` is required.');
    }

    return this._request({method: 'POST', path: `/users/${userID}/relationship`, postData: {action}});
  }

  //////////////////////////
  //// Media
  //////////////////////////

  getMediaInfoById(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}`});
  }

  getMediaInfoByShortCode(shortCode) {
    if(!shortCode) {
      throw new Error('Argument `shortCode` is required.');
    }

    return this._request({path: `/media/shortcode/${shortCode}`});
  }

  mediaSearch({lat = 0, lng = 0, distance = 10} = {}) {
    return this._request({path: '/media/search', query: {lat, lng, distance}});
  }

  //////////////////////////
  //// Comments
  //////////////////////////

  getCommentsForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}/comments`});
  }

  addCommentForMedia(mediaID, text) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!text) {
      throw new Error('Argument `text` is required.');
    }

    return this._request({method: 'POST', path: `/media/${mediaID}/comments`, postData: {text}});
  }

  removeCommentForMedia(mediaID, commentId) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    if(!commentId) {
      throw new Error('Argument `commentId` is required.');
    }

    return this._request({method: 'DELETE', path: `/media/${mediaID}/comments/${commentId}`});
  }

  //////////////////////////
  //// Likes
  //////////////////////////

  getLikesForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({path: `/media/${mediaID}/likes`});
  }

  addLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({method: 'POST', path: `/media/${mediaID}/likes`});
  }

  removeLikeForMedia(mediaID) {
    if(!mediaID) {
      throw new Error('Argument `mediaID` is required.');
    }

    return this._request({method: 'DELETE', path: `/media/${mediaID}/likes`});
  }

  //////////////////////////
  //// Tags
  //////////////////////////

  getTagInfoByTagName(tagName) {
    if(!tagName) {
      throw new Error('Argument `tagName` is required.');
    }

    return this._request({path: `/tags/${tagName}`});
  }

  getRecentMediaForTagName(tagName, {count = 10, min_tag_id = undefined, max_tag_id = undefined} = {}) {
    if(!tagName) {
      throw new Error('Argument `tagName` is required.');
    }

    return this._request({path: `/tags/${tagName}/media/recent`, query: {count, min_tag_id, max_tag_id}});
  }

  tagsSearch(q = '') {
    return this._request({path: '/tags/search', query: {q}});
  }

  //////////////////////////
  //// Locations
  //////////////////////////

  getLocationInfoByLocationId(locationId) {
    if(!locationId) {
      throw new Error('Argument `locationId` is required.');
    }

    return this._request({path: `/locations/${locationId}`});
  }

  getRecentMediaForLocationId(locationId, {min_tag_id = undefined, max_tag_id = undefined} = {}) {
    if(!locationId) {
      throw new Error('Argument `locationId` is required.');
    }

    return this._request({path: `/locations/${locationId}/media/recent`, query: {min_tag_id, max_tag_id}});
  }

  locationsSearch({distance = 1000, facebook_places_id = undefined, foursquare_id = undefined, lat = undefined, lng = undefined, foursquare_v2_id = undefined} = {}) {
    return this._request({path: '/locations/search', query: {distance, facebook_places_id, foursquare_id, lat, lng, foursquare_v2_id}});
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
            path: this.apiPath + path + '?' + querystring.stringify(query),
            method: method
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

      var request = https.request(requestOptions, function(res) {
        var resData = '',
            resJSON = '';

        if(res.statusCode == 204) {
          return resolve({});
        }

        res.on('data', function(data) {
          resData += data;
        });
        res.on('end', function() {
          logger.debug('_request: response statusCode:', res.statusCode);
          try {
            resJSON = JSON.parse(resData);
          } catch(err) {
            logger.debug('_request: invalid response:', resData);
            return reject(new Error('Invalid JSON response:' + resData));
          }
          logger.debug('_request: response: %:2j', resJSON);
          resolve(resJSON);
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
