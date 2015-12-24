
import InstagramSDK from '../src/index';
import should from 'should';
import sinon from 'sinon';
import _ from 'lodash';
import Promise from 'bluebird';
import https from 'https';

const instagramSDK = new InstagramSDK({
  accessToken: process.env.ACCESS_TOKEN
});

describe('Public endpoints', function() {
  before(function() {
    sinon.stub(instagramSDK, '_request', Promise.resolve);
    sinon.stub(instagramSDK, '_parseJSON', Promise.resolve);
  });
  after(function() {
    instagramSDK._request.restore();
    instagramSDK._parseJSON.restore();
  });

  describe('Users', function() {
    it('should get self account', function() {
      instagramSDK.getSelf().then(() => {
        sinon.assert.calledOnce(instagramSDK._request);
        sinon.assert.calledOnce(instagramSDK._parseJSON);
      });
    });

    it('should get self recent media', function() {
      instagramSDK.getSelfRecentMedia();
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/self/media/recent', query: {count: 10, max_id: undefined, min_id: undefined}});
    });

    it('should get self recent likes', function() {
      instagramSDK.getSelfRecentLikes();
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/self/media/liked', query: {count: 10, max_like_id: undefined}});
    });

    it('should get user account', function() {
      instagramSDK.getUser(123456);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/123456'});
    });

    it('should thrown a error on getting user account if no userID provided', function() {
      instagramSDK.getUser.should.throw();
    });

    it('should get user recent media', function() {
      instagramSDK.getUserRecentMedia(123456);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/123456/media/recent', query: {count: 10, max_id: undefined, min_id: undefined}});
    });

    it('should thrown a error on getting recent media if no userID provided', function() {
      instagramSDK.getUserRecentMedia.should.throw();
    });

    it('should search for users', function() {
      instagramSDK.usersSearch({q: 'qwe', count: 20});
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/search', query: {q: 'qwe', count: 20}});
    });

  });

  describe('Relationships', function() {
    it('should get self follows', function() {
      instagramSDK.getSelfFollows();
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/self/follows'});
    });

    it('should get self followed by', function() {
      instagramSDK.getSelfFollowedBy();
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/self/followed-by'});
    });

    it('should get self requested by', function() {
      instagramSDK.getSelfRequestedBy();
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/self/requested-by'});
    });

    it('should get user relationship', function() {
      instagramSDK.getUserRelationship(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/123/relationship'});
    });

    it('should thrown a error on getting user relationship if no userID provided', function() {
      instagramSDK.getUserRelationship.should.throw();
    });

    it('should update user relationship', function() {
      instagramSDK.updateUserRelationship(123, 'follow');
      sinon.assert.calledWithExactly(instagramSDK._request, {method: 'POST', path: '/users/123/relationship', postData: {action: 'follow'}});
    });

    it('should thrown a error on updating user relationship if no userID provided', function() {
      instagramSDK.updateUserRelationship.should.throw();
    });

  });

  describe('Media', function() {
    it('should get media info by id', function() {
      instagramSDK.getMediaInfoById(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123'});
    });

    it('should thrown a error on getting media info by id if no mediaID provided', function() {
      instagramSDK.getMediaInfoById.should.throw('Argument `mediaID` is required.');
    });

    it('should get media info by short code', function() {
      instagramSDK.getMediaInfoByShortCode('asd');
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/shortcode/asd'});
    });

    it('should thrown a error on getting media info by short code if no shortCode provided', function() {
      instagramSDK.getMediaInfoByShortCode.should.throw('Argument `shortCode` is required.');
    });

    it('should search for media', function() {
      instagramSDK.mediaSearch({lat: 10, lng: 10, distance: 110});
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/search', query: {lat: 10, lng: 10, distance: 110}});
    });

  });

  describe('Comments', function() {
    it('should get comments list for media by media id', function() {
      instagramSDK.getCommentsForMedia(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123/comments'});
    });

    it('should thrown a error on getting comments list if no mediaID provided', function() {
      instagramSDK.getCommentsForMedia.should.throw('Argument `mediaID` is required.');
    });

    it('should add comment for media by media id', function() {
      instagramSDK.addCommentForMedia(123, 'some text');
      sinon.assert.calledWithExactly(instagramSDK._request, {method: 'POST', path: '/media/123/comments', postData: {text: 'some text'}});
    });

    it('should thrown a error on adding comment if no mediaID or text provided', function() {
      instagramSDK.addCommentForMedia.should.throw('Argument `mediaID` is required.');
      _.partial(instagramSDK.addCommentForMedia, 123).should.throw('Argument `text` is required.');
    });

    it('should remove comment for media by media id and comment id', function() {
      instagramSDK.removeCommentForMedia(123, 465);
      sinon.assert.calledWithExactly(instagramSDK._request, {method: 'DELETE', path: '/media/123/comments/465'});
    });

    it('should thrown a error on adding comment if no mediaID or text provided', function() {
      instagramSDK.removeCommentForMedia.should.throw('Argument `mediaID` is required.');
      _.partial(instagramSDK.removeCommentForMedia, 123).should.throw('Argument `commentId` is required.');
    });

  });

  describe('Likes', function() {
    it('should get likes for media by media id', function() {
      instagramSDK.getLikesForMedia(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123/likes'});
    });

    it('should thrown a error on getting likes list if no mediaID provided', function() {
      instagramSDK.getLikesForMedia.should.throw('Argument `mediaID` is required.');
    });

    it('should add like for media by media id', function() {
      instagramSDK.addLikeForMedia(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {method: 'POST', path: '/media/123/likes'});
    });

    it('should thrown a error on adding like if no mediaID provided', function() {
      instagramSDK.addLikeForMedia.should.throw('Argument `mediaID` is required.');
    });

    it('should remove like for media by media id', function() {
      instagramSDK.removeLikeForMedia(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {method: 'DELETE', path: '/media/123/likes'});
    });

    it('should thrown a error on removing like if no mediaID provided', function() {
      instagramSDK.removeLikeForMedia.should.throw('Argument `mediaID` is required.');
    });

  });

  describe('Tags', function() {
    it('should get tag info by tag name', function() {
      instagramSDK.getTagInfoByTagName('qwe');
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/tags/qwe'});
    });

    it('should thrown a error on getting tag info if no tagName provided', function() {
      instagramSDK.getTagInfoByTagName.should.throw('Argument `tagName` is required.');
    });

    it('should get recent media by tag name', function() {
      instagramSDK.getRecentMediaForTagName('qwe');
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/tags/qwe/media/recent', query: {count: 10, min_tag_id: undefined, max_tag_id: undefined}});
    });

    it('should thrown a error on getting recent media if no tagName provided', function() {
      instagramSDK.getRecentMediaForTagName.should.throw('Argument `tagName` is required.');
    });

    it('should search for tag', function() {
      instagramSDK.tagsSearch('qwe');
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/tags/search', query: {q: 'qwe'}});
    });

  });

  describe('Locations', function() {
    it('should get location info by location id', function() {
      instagramSDK.getLocationInfoByLocationId(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/locations/123'});
    });

    it('should thrown a error on getting location info if no locationId provided', function() {
      instagramSDK.getLocationInfoByLocationId.should.throw('Argument `locationId` is required.');
    });

    it('should get recent media by location id', function() {
      instagramSDK.getRecentMediaForLocationId(123);
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/locations/123/media/recent', query: {count: 10, min_id: undefined, max_id: undefined}});
    });

    it('should thrown a error on getting recent media if no locationId provided', function() {
      instagramSDK.getRecentMediaForLocationId.should.throw('Argument `locationId` is required.');
    });

    it('should search for location', function() {
      instagramSDK.locationsSearch({facebook_places_id: 789});
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/locations/search', query: {distance: 1000, facebook_places_id: 789, foursquare_id: undefined, lat: undefined, lng: undefined, foursquare_v2_id: undefined}});
    });

  });

  describe('Embedding', function() {
    before(function() {
      sinon.stub(instagramSDK, '_getHeaderValue', Promise.resolve);
    });
    after(function() {
      instagramSDK._getHeaderValue.restore();
    });

    it('should get media JPG url by short code', function() {
      instagramSDK.getMediaJPGByShortCode('qwe');
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/p/qwe/media'});
      sinon.assert.calledOnce(instagramSDK._getHeaderValue);
    });

    it('should thrown a error on getting media JPG url if no shortCode provided', function() {
      instagramSDK.getMediaJPGByShortCode.should.throw('Argument `shortCode` is required.');
      sinon.assert.calledOnce(instagramSDK._getHeaderValue);
    });

  });

});

describe('_request', function() {
  var writeStub, onStub, endStub;
  beforeEach(function() {
    function requestStub() {
      var that = this;
      writeStub = sinon.stub().returns(that);
      onStub = sinon.stub().returns(that);
      endStub = sinon.stub().returns(that);
      this.on = onStub;
      this.end = endStub;
      this.write = writeStub;
      return that;
    }
    sinon.stub(https, 'request', requestStub);
  });
  afterEach(function() {
    https.request.restore();
  });

  it('should send GET-request to `/api/users`', function() {
    instagramSDK._request({path: '/api/users'});

    sinon.assert.calledWithMatch(https.request, {
      method: 'GET',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json'
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.notCalled(writeStub);
  });

  it('should send POST-request with empty body to `/api/users`', function() {
    instagramSDK._request({method: 'POST', path: '/api/users'});

    sinon.assert.calledWithMatch(https.request, {
      method: 'POST',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json'
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.notCalled(writeStub);
  });

  it('should send POST-request with body to `/api/users`', function() {
    let postData = {qwe: 'asd'},
        postDataJSON = JSON.stringify(postData);

    instagramSDK._request({method: 'POST', path: '/api/users', postData});

    sinon.assert.calledWithMatch(https.request, {
      method: 'POST',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-length': postDataJSON.length
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.calledWithExactly(writeStub, postDataJSON);
  });

  it('should send GET-request with query to `/api/users`', function() {
    instagramSDK._request({method: 'GET', path: '/api/users', query: {qwe: 'asd'}});

    sinon.assert.calledWithMatch(https.request, {
      method: 'GET',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?qwe=asd&access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json'
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.notCalled(writeStub);
  });

  it('should send POST-request with body and query to `/api/users`', function() {
    let postData = {qwe: 'asd'},
        postDataJSON = JSON.stringify(postData);

    instagramSDK._request({method: 'POST', path: '/api/users', postData, query: {qwe: 'asd'}});

    sinon.assert.calledWithMatch(https.request, {
      method: 'POST',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?qwe=asd&access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-length': postDataJSON.length
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.calledWithExactly(writeStub, postDataJSON);
  });

  it('should reject undefined query fields', function() {
    instagramSDK._request({method: 'GET', path: '/api/users', query: {qwe: 'asd', asd: undefined}});

    sinon.assert.calledWithMatch(https.request, {
      method: 'GET',
      hostname: instagramSDK.instagramHost,
      path: `${instagramSDK.apiPath}/api/users?qwe=asd&access_token=${instagramSDK.accessToken}`,
      headers: {
        Accept: 'application/json'
      }
    });

    sinon.assert.calledOnce(onStub);
    sinon.assert.calledOnce(endStub);
    sinon.assert.notCalled(writeStub);
  });

});

describe('Get all helpers', () => {
  beforeEach(function() {
    sinon.stub(instagramSDK, 'getSelfRecentMedia', () => {
      return Promise.resolve({
        meta: {code: 200},
        data: []
      });
    });
    sinon.stub(instagramSDK, 'getSelfRecentLikes', () => {
      return Promise.resolve({
        meta: {code: 200},
        data: []
      });
    });
  });

  afterEach(function() {
    instagramSDK.getSelfRecentMedia.restore();
    instagramSDK.getSelfRecentLikes.restore();
  });

  it('should get self all media', function() {
    instagramSDK.getSelfAllMedia([{count: 10}], {timeout: 10});
    sinon.assert.calledWithExactly(instagramSDK.getSelfRecentMedia, {count: 10, max_id: null});
  });

  it('should get self all likes', function() {
    instagramSDK.getSelfAllLikes([{count: 10}], {timeout: 10});
    sinon.assert.calledWithExactly(instagramSDK.getSelfRecentLikes, {count: 10, max_like_id: null});
  });

});
