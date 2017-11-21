
import {Readable, ReadableOptions} from 'stream';

import * as _ from 'lodash';
import * as delay from 'delay';

import {IGSDK} from './InstagramSDKWeb';
import {IGBody} from './RequestWeb';

export default class GenericStream<TQuery extends KeyValuePairs, TResponse extends IGBody> extends Readable {
    public requestInProgress = false;
    public endCursor: string | undefined;
    public ended: boolean;
    public destroyed: boolean;
    public delayMinInterval = 1000;
    public delayMaxInterval = 3000;

    private externalBuffer = [];
    private boundErrorHandler = this.errorHandler.bind(this);
    private boundSuccessHandler = this.successHandler.bind(this);

    constructor(
        opt: ReadableOptions,
        private sdk: IGSDK,
        public method: string,
        private pathToItems: string,
        private pathToPageInfo: string,
        private paginationProp = 'max_id',
        public query: TQuery,
        private customSuccessHandler?: CustomSuccessHandler<TQuery, TResponse>,
    ) {
        super(opt);

        if (this.customSuccessHandler) {
            this.customSuccessHandler = this.customSuccessHandler.bind(this);
        }
    }

    public _read(size: number) {
        while (this.externalBuffer.length && !this.ended && !this.destroyed) {
            if (!this.push(this.externalBuffer.shift())) {
                return;
            }
        }

        if (this.requestInProgress) {
            return;
        }

        this.requestData();
    }

    public requestData() {
        this.requestInProgress = true;

        this.getItems(this.endCursor)
            .then(delay(_.random(this.delayMinInterval, this.delayMaxInterval)))
            .then(this.customSuccessHandler || this.boundSuccessHandler)
            .catch(this.boundErrorHandler);
    }

    public getItems(endCursor: string | undefined) {
        const query = Object.assign({}, this.query, {[this.paginationProp]: endCursor});

        return this.sdk[this.method](query);
    }

    public destroy(...args: any[]) {
        this.externalBuffer = [];
        super.destroy(...args);
    }

    private errorHandler(err: Error) {
        this.requestInProgress = false;
        console.error('error on fetch', err, this.method, this.endCursor, this.query);
        process.nextTick(() => this.emit('error', err));
    }

    private successHandler(response: TResponse) {
        this.requestInProgress = false;

        const pageInfo = _.get<object, IGGraphQLPageInfo>(response, this.pathToPageInfo, {}),
            items = _.get(response, this.pathToItems, []);

        this.endCursor = pageInfo.end_cursor;

        if (!items.length) {
            // sometimes API responses with empty items, but with next page available.
            // re-send request in such case.
            if (pageInfo.has_next_page) {
                delay(_.random(this.delayMinInterval, this.delayMaxInterval)).then(() => {
                    // FIXME: `this.requestInProgress` - race condition?
                    this.requestData();
                });
                return;
            }

            this.push(null);
            return;
        }

        while (items.length && !this.ended && !this.destroyed) {
            if (!this.push(items.shift())) {
                [].push.apply(this.externalBuffer, items);
                break;
            }
        }
    }
}

interface IGGraphQLPageInfo {
    has_next_page?: boolean;
    end_cursor?: string;
}

export interface KeyValuePairs {
    [key: string]: any;
}

export type CustomSuccessHandler<U, T> = (this: GenericStream<U, T & IGBody>, response: IGBody) => void;