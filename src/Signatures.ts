
import * as crypto from 'crypto';
import * as uuid from 'uuid';
import Constants from './Constants';

export default class Signatures {
    public static generateUUID(hyphens = true) {
        const UUID = uuid.v4();

        if (!hyphens) {
            return UUID.replace(/-/g, '');
        }

        return UUID;
    }

    public static generateDeviceId() {
        return 'android-' + crypto.randomBytes(8).toString('hex');
    }

    public static generateSignature(data: object) {
        const json = JSON.stringify(data),
            hash = crypto.createHmac('SHA256', Constants.IG_SIG_KEY).update(json).digest('hex');

        return {
            ig_sig_key_version: Constants.SIG_KEY_VERSION,
            signed_body: `${hash}.${json}`,
        };
    }
};
