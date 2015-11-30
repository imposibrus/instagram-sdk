
import CintSDK from '../src/index';
import should from 'should';
import sinon from 'sinon';

const cintSDK = new CintSDK({key: process.env.CINTKEY, secret: process.env.CINTSECRET});

describe('Main page', function() {
  before(function() {
    sinon.stub(cintSDK, '_request');
  });
  after(function() {
    cintSDK._request.restore();
  });

  it('should get main page', function() {
    cintSDK.getMain();
    sinon.assert.calledOnce(cintSDK._request);
  });

  it('should auth headers exist', function() {
    should.exist(cintSDK.basicAuthString);
  });

  it('should get settings page', function() {
    // FIXME: broken
    cintSDK.getSetting();
    sinon.assert.calledWithMatch(cintSDK._request, {path: '/panel/settings'});
  });

  it('should get genders page', function() {
    cintSDK.getGenders();
    sinon.assert.calledWithMatch(cintSDK._request, {path: '/genders'});
  });

  it('should get panel page', function() {
    cintSDK.getPanel(process.env.CINTKEY);
    sinon.assert.calledWithMatch(cintSDK._request, {path: '/panels/' + process.env.CINTKEY});
  });

});
