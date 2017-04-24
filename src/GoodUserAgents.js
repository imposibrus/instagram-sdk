
const _ = require('lodash');

class GoodUserAgents {
    static userAgents = [
        /* OnePlus 3T. Released: November 2016.
         * https://www.amazon.com/OnePlus-A3010-64GB-Gunmetal-International/dp/B01N4H00V8
         * https://www.handsetdetection.com/properties/devices/OnePlus/A3010
         */
        'Instagram 10.15.0 Android (24/7.0; 380dpi; 1080x1920; OnePlus; ONEPLUS A3010; OnePlus3T; qcom; en_US)',

        /* LG G5. Released: April 2016.
         * https://www.amazon.com/LG-Unlocked-Phone-Titan-Warranty/dp/B01DJE22C2
         * https://www.handsetdetection.com/properties/devices/LG/RS988
         */
        'Instagram 10.15.0 Android (23/6.0.1; 640dpi; 1440x2392; LGE/lge; RS988; h1; h1; en_US)',

        /* Huawei Mate 9 Pro. Released: January 2017.
         * https://www.amazon.com/Huawei-Dual-Sim-Titanium-Unlocked-International/dp/B01N9O1L6N
         * https://www.handsetdetection.com/properties/devices/Huawei/LON-L29
         */
        'Instagram 10.15.0 Android (24/7.0; 640dpi; 1440x2560; HUAWEI; LON-L29; HWLON; hi3660; en_US)',

        /* ZTE Axon 7. Released: June 2016.
         * https://www.frequencycheck.com/models/OMYDK/zte-axon-7-a2017u-dual-sim-lte-a-64gb
         * https://www.handsetdetection.com/properties/devices/ZTE/A2017U
         */
        'Instagram 10.15.0 Android (23/6.0.1; 640dpi; 1440x2560; ZTE; ZTE A2017U; ailsa_ii; qcom; en_US)',

        /* Samsung Galaxy S7 Edge SM-G935F. Released: March 2016.
         * https://www.amazon.com/Samsung-SM-G935F-Factory-Unlocked-Smartphone/dp/B01C5OIINO
         * https://www.handsetdetection.com/properties/devices/Samsung/SM-G935F
         */
        'Instagram 10.15.0 Android (23/6.0.1; 640dpi; 1440x2560; samsung; SM-G935F; hero2lte; samsungexynos8890; en_US)',

        /* Samsung Galaxy S7 SM-G930F. Released: March 2016.
         * https://www.amazon.com/Samsung-SM-G930F-Factory-Unlocked-Smartphone/dp/B01J6MS6BC
         * https://www.handsetdetection.com/properties/devices/Samsung/SM-G930F
         */
        'Instagram 10.15.0 Android (23/6.0.1; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US)',
    ];

    static getRandomGoodUserAgent() {
        return _.sample(GoodUserAgents.userAgents);
    }

    static getAllGoodUserAgents() {
        return GoodUserAgents.userAgents;
    }

    static isGoodUserAgent(userAgent) {
        return GoodUserAgents.userAgents.indexOf(userAgent) !== -1;
    }
}

module.exports = GoodUserAgents;
