
const crypto = require('crypto'),
    uuid = require('uuid'),
    Constants = require('./Constants');

class Signatures {
    static generateUUID(hyphens = true) {
        let UUID = uuid.v4();

        if (!hyphens) {
            return UUID.replace(/-/g, '');
        }

        return UUID;
    }

    static generateDeviceId() {
        return 'android-' + crypto.randomBytes(8).toString('hex');
    }

    static generateSignature(data) {
        let json = JSON.stringify(data),
            hash = crypto.createHmac('SHA256', Constants.IG_SIG_KEY).update(json).digest('hex');

        return {
            ig_sig_key_version: Constants.SIG_KEY_VERSION,
            signed_body: `${hash}.${json}`,
        };
    }
}

module.exports = Signatures;
