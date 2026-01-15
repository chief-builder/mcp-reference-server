/**
 * Server-Sent Events stream with replay capability
 */
export class SseStream {
    buffer = [];
    constructor(_options) {
        // TODO: Implement SSE stream
    }
    getBuffer() {
        return this.buffer;
    }
    send(_message) {
        // TODO: Implement message sending
    }
    replay(_fromId) {
        // TODO: Implement replay from message ID
        return [];
    }
    close() {
        // TODO: Implement stream closing
    }
}
//# sourceMappingURL=sse.js.map