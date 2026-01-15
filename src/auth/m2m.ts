/**
 * Machine-to-Machine (M2M) OAuth extension
 */

export interface M2MClientConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes?: string[];
}

export interface M2MTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope?: string;
}

export class M2MClient {
  private tokenCache?: { token: string; expiresAt: number };
  private readonly config: M2MClientConfig;

  constructor(config: M2MClientConfig) {
    this.config = config;
  }

  getConfig(): M2MClientConfig {
    return this.config;
  }

  async getAccessToken(): Promise<string> {
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

  private async requestToken(): Promise<M2MTokenResponse> {
    // TODO: Implement client credentials grant
    throw new Error('Not implemented');
  }
}
