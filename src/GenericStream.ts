
import {ReadableOptions} from 'stream';

import {Readable} from 'stronger-typed-streams';
import {get, random, Dictionary} from 'lodash';
import * as delay from 'delay';

import {IGSDK} from './InstagramSDKWeb';
import {IGBody} from './RequestWeb';
import Logger from './lib/logger';

const logger = Logger.getLogger('GenericStream');

export class GenericStream<
    TQuery extends Dictionary<any>,
    TResponse extends IGBody,
    TOut
> extends Readable<TOut> {
    public requestInProgress = false;
    public endCursor: string | undefined;
    public ended: boolean;
    public destroyed: boolean;
    public delayMinInterval = 1000;
    public delayMaxInterval = 3000;

    private externalBuffer: TOut[] = [];
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
        private customSuccessHandler?: CustomSuccessHandler<TQuery, TResponse, TOut>,
    ) {
        super(opt);

        if (this.customSuccessHandler) {
            this.customSuccessHandler = this.customSuccessHandler.bind(this);
        }
    }

    public _read(size: number) {
        while (this.externalBuffer.length && !this.ended && !this.destroyed) {
            const chunk = this.externalBuffer.shift();

            if (chunk && !this.push(chunk)) {
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
            .then(delay(random(this.delayMinInterval, this.delayMaxInterval)))
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
        logger.debug('error on fetch %s %s %j', this.method, this.endCursor, this.query, err);
        process.nextTick(() => this.emit('error', err));
    }

    private successHandler(response: TResponse) {
        this.requestInProgress = false;

        const pageInfo = get<object, IGGraphQLPageInfo>(response, this.pathToPageInfo, {}),
            items = get(response, this.pathToItems, []);

        this.endCursor = pageInfo.end_cursor;

        if (!items.length) {
            // sometimes API responses with empty items, but with next page available.
            // re-send request in such case.
            if (pageInfo.has_next_page) {
                delay(random(this.delayMinInterval, this.delayMaxInterval)).then(() => {
                    // FIXME: `this.requestInProgress` - race condition?
                    this.requestData();
                });
                return;
            }

            this.push(null);
            return;
        }

        while (items.length && !this.ended && !this.destroyed) {
            const chunk = items.shift();

            if (chunk && !this.push(chunk)) {
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

export type CustomSuccessHandler<U, T, TOut> = (this: GenericStream<U, T & IGBody, TOut>, response: IGBody) => void;
