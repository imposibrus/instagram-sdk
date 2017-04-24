
const path = require('path'),
    fs = require('fs'),
    util = require('util');

class UserSettings {
    baseDir;
    userDir;
    username;
    fileNames = {
        'cookies': `%s-cookies.json`,
        'settings': `%s-settings.json`,
    };
    _settings = {};

    constructor(baseDir, username) {
        this.baseDir = baseDir;
        this.userDir = path.join(baseDir, username);
        this.username = username;

        if (!this.isDirExists()) {
            this.mkdir();
            this.createFiles();
        }

        const settings = this.loadUserSettings();

        for (let key in settings) {
            if (settings.hasOwnProperty(key)) {
                this._settings[key] = settings[key];
            }
        }
    }

    get(key) {
        return this._settings[key];
    }

    set(key, value) {
        this._settings[key] = value;

        setTimeout(this.saveUserSettings.bind(this), 0);
    }

    get cookiesFilePath() {
        return path.join(this.userDir, util.format(this.fileNames.cookies, this.username));
    }

    resetCookies() {
        return fs.writeFileSync(this.cookiesFilePath, '');
    }

    saveUserSettings() {
        fs.writeFileSync(path.join(this.userDir, util.format(this.fileNames.settings, this.username)), JSON.stringify(this._settings));
    }

    loadUserSettings() {
        const fileData = fs.readFileSync(path.join(this.userDir, util.format(this.fileNames.settings, this.username)));
        let json;

        try {
            json = JSON.parse(fileData);
        } catch(err) {
            // handler
        }

        return json;
    }

    createFiles() {
        for (let fileType in this.fileNames) {
            fs.writeFileSync(path.join(this.userDir, util.format(this.fileNames[fileType], this.username)), '');
        }
    }

    mkdir() {
        return fs.mkdirSync(this.userDir);
    }

    isDirExists() {
        try {
            fs.accessSync(this.userDir);
            return true;
        } catch(err) {
            return false;
        }
    }

    isMaybeLoggedIn() {
        let fileExist;

        try {
            fs.accessSync(this.cookiesFilePath);
            fileExist = true;
        } catch(err) {
            fileExist = false;
        }

        return fileExist && this.get('account_id') && this.get('token');
    }
}

module.exports = UserSettings;
