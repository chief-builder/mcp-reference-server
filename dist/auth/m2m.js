/**
 * Machine-to-Machine (M2M) OAuth extension
 */
export class M2MClient {
    tokenCache;
    config;
    constructor(config) {
        this.config = config;
    }
    getConfig() {
        return this.config;
    }
    async getAccessToken() {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60000) {
            return this.tokenCache.token;
        }
        const response = await this.requestToken();
        this.tokenCache = {
            token: response.accessToken,
            expiresAt: Date.now() + response.expiresIn * 1000,
        };
        return response.accessToken;
    }
    async requestToken() {
        // TODO: Implement client credentials grant
        throw new Error('Not implemented');
    }
}
//# sourceMappingURL=m2m.js.map