
const path = require('path'),
    fs = require('fs'),
    request = require('Request'),
    sinon = require('sinon'),
    Promise = require('bluebird'),
    rimraf = require('rimraf'),
    InstagramSDK = require('./InstagramSDK'),
    Constants = require('./Constants'),
    usersDataDir = path.join(__dirname, 'fixtures'),
    instagramSDK = new InstagramSDK('username', 'password', usersDataDir);

describe('Constructor', () => {
    const cookieTestFilePath = path.join(__dirname, 'fixtures', 'cookie-test-1.json'),
        userDataDir = path.join(usersDataDir, 'username');

    before(() => {
        if (fs.existsSync(cookieTestFilePath)) {
            fs.unlinkSync(cookieTestFilePath);
        }

        if (fs.existsSync(userDataDir)) {
            rimraf.sync(cookieTestFilePath);
        }
    });

    after(() => {
        fs.unlinkSync(cookieTestFilePath);
        rimraf.sync(cookieTestFilePath);
    });

    it('should `username`, `password` and `userSettingsDirPath` arguments be required', () => {
        (function() {
            new InstagramSDK('asd');
        }).should.throw('You must specify both `username`, `password` and `userSettingsDirPath`.');
    });

    it('should create data dir by provided path if it is not exists', () => {
        fs.existsSync(userDataDir).should.be.equal(false);
        new InstagramSDK('username', 'password', usersDataDir);
        fs.existsSync(userDataDir).should.be.equal(true);
    });
});

describe('Public endpoints', function() {
    before(function() {
        sinon.stub(instagramSDK, '_request', Promise.resolve);
        sinon.stub(instagramSDK, 'extractCSRFToken', () => {
            instagramSDK.token = 'CSRFToken';

            return Promise.resolve();
        });

        // sinon.stub(instagramSDK, '_parseJSON', Promise.resolve);
    });

    after(function() {
        instagramSDK._request.restore();
        instagramSDK.extractCSRFToken.restore();
        // instagramSDK._parseJSON.restore();
        // fs.unlinkSync(path.join(__dirname, 'userSettingsDirPath.json'));
    });

    describe('Login', () => {
        before(() => {
            // instagramSDK._parseJSON.restore();
            sinon.stub(instagramSDK, '_parseJSON', () => {
                return Promise.resolve({status: 'ok', logged_in_user: {pk: '123'}});
            });
        });

        after(() => {
            instagramSDK._parseJSON.restore();
            sinon.stub(instagramSDK, '_parseJSON', Promise.resolve);
        });

        it('should login', function(done) {
            instagramSDK.login().then(() => {
                sinon.assert.calledTwice(instagramSDK._request);
                sinon.assert.calledTwice(instagramSDK.extractCSRFToken);
                sinon.assert.calledOnce(instagramSDK._parseJSON);
                instagramSDK.should.have.properties(['deviceId', 'uuid', 'CSRFToken', 'isLoggedIn', 'usernameId', 'rankToken']);
                done();
            }).catch(done);
        });

    });

    describe('Users', function() {
        it('should get self account', function() {
            instagramSDK.getSelf();
            sinon.assert.calledWithExactly(instagramSDK._request, {path: `/users/${instagramSDK.usernameId}/info/`});
        });

        it('should get self recent media', function() {
            instagramSDK.getSelfRecentMedia();
            sinon.assert.calledWithExactly(instagramSDK._request, {path: `/feed/user/${instagramSDK.usernameId}/`, query: {count: 10, max_id: undefined, min_id: undefined}});
        });

        it('should get user account', function() {
            instagramSDK.getUser(123456);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/123456/info/'});
        });

        it('should thrown a error on getting user account if no userID provided', function() {
            instagramSDK.getUser.should.throw();
        });

        it('should get user recent media', function() {
            instagramSDK.getUserRecentMedia(123456);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/feed/user/123456/', query: {count: 10, max_id: undefined, min_id: undefined}});
        });

        it('should thrown a error on getting recent media if no userID provided', function() {
            instagramSDK.getUserRecentMedia.should.throw();
        });

        it('should search for users', function() {
            instagramSDK.usersSearch({q: 'qwe', count: 20});
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/users/search/', query: {q: 'qwe', count: 20, rank_token: instagramSDK.rankToken}});
        });

    });

    describe('Relationships', function() {
        it('should get self follows', function() {
            instagramSDK.getSelfFollows();
            sinon.assert.calledWithExactly(instagramSDK._request, {path: `/friendships/${instagramSDK.usernameId}/following/`, query: {rank_token: instagramSDK.rankToken}});
        });

        it('should get self followed by', function() {
            instagramSDK.getSelfFollowedBy();
            sinon.assert.calledWithExactly(instagramSDK._request, {path: `/friendships/${instagramSDK.usernameId}/followers/`, query: {rank_token: instagramSDK.rankToken}});
        });

        it('should get user relationship', function() {
            instagramSDK.getUserRelationship(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/friendships/show/123/'});
        });

        it('should thrown a error on getting user relationship if no userID provided', function() {
            instagramSDK.getUserRelationship.should.throw();
        });

    });

    describe('Media', function() {
        it('should get media info by id', function() {
            instagramSDK.getMediaInfoById(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123/info/'});
        });

        it('should thrown a error on getting media info by id if no mediaID provided', function() {
            instagramSDK.getMediaInfoById.should.throw('Argument `mediaID` is required.');
        });

    });

    describe('Comments', function() {
        it('should get comments list for media by media id', function() {
            instagramSDK.getCommentsForMedia(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123/comments/'});
        });

        it('should thrown a error on getting comments list if no mediaID provided', function() {
            instagramSDK.getCommentsForMedia.should.throw('Argument `mediaID` is required.');
        });

    });

    describe('Likes', function() {
        it('should get likes for media by media id', function() {
            instagramSDK.getLikesForMedia(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/media/123/likers/'});
        });

        it('should thrown a error on getting likes list if no mediaID provided', function() {
            instagramSDK.getLikesForMedia.should.throw('Argument `mediaID` is required.');
        });

        it('should add like for media by media id', function() {
            instagramSDK.addLikeForMedia(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {method: 'POST', path: '/media/123/like/',
                postData: InstagramSDK.generateSignature({
                    _uuid: instagramSDK.uuid,
                    _uid: instagramSDK.usernameId,
                    _csrftoken: instagramSDK.CSRFToken,
                    media_id: 123
                })});
        });

        it('should thrown a error on adding like if no mediaID provided', function() {
            instagramSDK.addLikeForMedia.should.throw('Argument `mediaID` is required.');
        });

        it('should remove like for media by media id', function() {
            instagramSDK.removeLikeForMedia(123);
            sinon.assert.calledWithExactly(instagramSDK._request, {method: 'POST', path: '/media/123/unlike/',
                postData: InstagramSDK.generateSignature({
                    _uuid: instagramSDK.uuid,
                    _uid: instagramSDK.usernameId,
                    _csrftoken: instagramSDK.CSRFToken,
                    media_id: 123
                })});
        });

        it('should thrown a error on removing like if no mediaID provided', function() {
            instagramSDK.removeLikeForMedia.should.throw('Argument `mediaID` is required.');
        });

    });

    describe('Tags', function() {
        it('should search for tag', function() {
            instagramSDK.tagsSearch('qwe');
            sinon.assert.calledWithExactly(instagramSDK._request, {path: '/tags/search/', query: {q: 'qwe', count: 20, rank_token: instagramSDK.rankToken}});
        });

    });

});

describe('_request', function() {
    beforeEach(function() {
        function requestStub() {}

        sinon.stub(request, 'get', requestStub);
        sinon.stub(request, 'post', requestStub);
    });

    afterEach(function() {
        request.get.restore();
        request.post.restore();
    });

    it('should send GET-request to `/api/users`', function() {
        instagramSDK._request({path: '/api/users'});

        sinon.assert.calledWithMatch(request.get, {
            method: 'GET',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

    it('should send POST-request with empty body to `/api/users`', function() {
        instagramSDK._request({method: 'POST', path: '/api/users'});

        sinon.assert.calledWithMatch(request.post, {
            method: 'POST',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

    it('should send POST-request with body to `/api/users`', function() {
        let postData = {qwe: 'asd'};

        instagramSDK._request({method: 'POST', path: '/api/users', postData});

        sinon.assert.calledWithMatch(request.post, {
            method: 'POST',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            form: postData,
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

    it('should send GET-request with query to `/api/users`', function() {
        instagramSDK._request({method: 'GET', path: '/api/users', query: {qwe: 'asd'}});

        sinon.assert.calledWithMatch(request.get, {
            method: 'GET',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            qs: {qwe: 'asd'},
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

    it('should send POST-request with body and query to `/api/users`', function() {
        let postData = {qwe: 'asd'};

        instagramSDK._request({method: 'POST', path: '/api/users', postData, query: {qwe: 'asd'}});

        sinon.assert.calledWithMatch(request.post, {
            method: 'POST',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            qs: {qwe: 'asd'},
            form: postData,
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

    it('should reject undefined query fields', function() {
        instagramSDK._request({method: 'GET', path: '/api/users', query: {qwe: 'asd', asd: undefined}});

        sinon.assert.calledWithMatch(request.get, {
            method: 'GET',
            baseUrl: `https://${instagramSDK.instagramHost + instagramSDK.apiPath}`,
            url: `/api/users`,
            qs: {qwe: 'asd'},
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': 'nQ==',
                'Cookie2': '$Version=1'
            },
            jar: instagramSDK.jar,
            timeout: 5000
        });
    });

});

describe('Get all helpers', () => {
    beforeEach(function() {
        sinon.stub(instagramSDK, 'getSelfRecentMedia', () => {
            return Promise.resolve({
                status: 'ok',
                items: []
            });
        });
    });

    afterEach(function() {
        instagramSDK.getSelfRecentMedia.restore();
    });

    it('should get self all media', function() {
        instagramSDK.getSelfAllMedia([{count: 10}], {timeout: 10});
        sinon.assert.calledWithExactly(instagramSDK.getSelfRecentMedia, {count: 10, max_id: null});
    });

});
