
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

  getSelf() {
    return this._request();
  }

  getSelfRecentMedia() {
    // COUNT, MIN_ID, MAX_ID
    return this._request({path: '/users/self/media/recent'});
  }

  getSelfRecentLikes() {
    // COUNT, MAX_LIKE_ID
    return this._request({path: '/users/self/media/liked'});
  }

  getUser(userID) {
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: '/users/' + userID});
  }

  getUserRecentMedia(userID) {
    // COUNT, MIN_ID, MAX_ID
    if(!userID) {
      throw new Error('Argument `userID` is required.');
    }

    return this._request({path: `/users/${userID}/media/recent`});
  }

  usersSearch({query = '', count = 10}) {
    return this._request({path: '/users/search'});
  }

  _request({method = 'GET', path = '/users/self', postData} = {}) {
    return new Promise((resolve, reject) => {
      let contentType = 'application/json',
          headers = {
            Accept: contentType
          },
          requestOptions = {
            hostname: this.instagramHost,
            path: this.apiPath + path + '?access_token=' + this.accessToken,
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
