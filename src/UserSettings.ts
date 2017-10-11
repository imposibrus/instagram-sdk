
import {fromPairs} from 'lodash';

export default class UserSettings {
    public prefix = 'big-brother:instagram:settings:';

    constructor(public baseDir: string, public username: string, public redisClient: any) {
        if (!redisClient) {
            throw new Error('`redisClient` is required.');
        }
    }

    public async get(key: string) {
        return await this.redisClient.get(this.prefix + key);
    }

    public async set(key: string, value: string | number) {
        await this.redisClient.set(this.prefix + key, value);
    }

    public async loadUserSettings() {
        const keys = await this.getAllKeys();

        return fromPairs(keys.map((key) => {
            return [key.split(':').slice(-1)[0], this.redisClient.get(key)];
        }));
    }

    public async isMaybeLoggedIn() {
        let hasKeys;

        try {
            hasKeys = !!(await this.getAllKeys()).length;
        } catch (err) {
            hasKeys = false;
        }

        return hasKeys && await this.get('account_id') && await this.get('token');
    }

    private async getAllKeys(): Promise<string[]> {
        return await this.redisClient.keys(this.prefix + '*');
    }
};
