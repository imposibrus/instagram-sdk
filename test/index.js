
import InstagramSDK from '../src/index';
import should from 'should';
import sinon from 'sinon';
import _ from 'lodash';

const instagramSDK = new InstagramSDK({
  accessToken: process.env.ACCESS_TOKEN
});

describe('InstagramSDK', function() {
  before(function() {
    sinon.stub(instagramSDK, '_request');
  });
  after(function() {
    instagramSDK._request.restore();
  });

  describe('Users', function() {
    it('should get self account', function() {
      instagramSDK.getSelf();
      sinon.assert.calledOnce(instagramSDK._request);
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
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/locations/123/media/recent', query: {min_tag_id: undefined, max_tag_id: undefined}});
    });

    it('should thrown a error on getting recent media if no locationId provided', function() {
      instagramSDK.getRecentMediaForLocationId.should.throw('Argument `locationId` is required.');
    });

    it('should search for location', function() {
      instagramSDK.locationsSearch({facebook_places_id: 789});
      sinon.assert.calledWithExactly(instagramSDK._request, {path: '/locations/search', query: {distance: 1000, facebook_places_id: 789, foursquare_id: undefined, lat: undefined, lng: undefined, foursquare_v2_id: undefined}});
    });

  });
});
