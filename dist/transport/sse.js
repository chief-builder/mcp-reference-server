/**
 * Server-Sent Events stream with replay capability
 *
 * Implements SSE streaming for MCP with:
 * - Event ID format: "<session>:<sequence>" per SEP-1699
 * - Replay support via Last-Event-Id header
 * - Configurable event buffer per session
 */
// =============================================================================
// SSEStream Class
// =============================================================================
/**
 * Represents an active SSE stream for a single session
 */
export class SSEStream {
    res;
    sessionId;
    sequence = 0;
    active = true;
    keepAliveTimer = null;
    eventBuffer = [];
    bufferSize;
    constructor(res, sessionId, options) {
        this.res = res;
        this.sessionId = sessionId;
        this.bufferSize = options?.bufferSize ?? 100;
        // Set SSE headers
        this.res.setHeader('Content-Type', 'text/event-stream');
        this.res.setHeader('Cache-Control', 'no-cache');
        this.res.setHeader('Connection', 'keep-alive');
        this.res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        // Flush headers immediately
        this.res.flushHeaders();
        // Setup keep-alive if configured
        const keepAliveInterval = options?.keepAliveInterval ?? 30000;
        if (keepAliveInterval > 0) {
            this.keepAliveTimer = setInterval(() => {
                this.sendComment('keep-alive');
            }, keepAliveInterval);
        }
        // Handle client disconnect
        this.res.on('close', () => {
            this.active = false;
            this.stopKeepAlive();
        });
    }
    /**
     * Get whether the stream is still active
     */
    get isActive() {
        return this.active;
    }
    /**
     * Get the current sequence number
     */
    get currentSequence() {
        return this.sequence;
    }
    /**
     * Get the session ID for this stream
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * Get the event buffer (for replay)
     */
    getBuffer() {
        return [...this.eventBuffer];
    }
    /**
     * Send a JSON-RPC message as an SSE event
     */
    send(message) {
        if (!this.active) {
            return;
        }
        this.sequence += 1;
        const eventId = `${this.sessionId}:${this.sequence}`;
        const data = JSON.stringify(message);
        const event = {
            id: eventId,
            data,
        };
        // Add to buffer
        this.addToBuffer(event);
        // Write SSE formatted event
        this.writeEvent(event);
    }
    /**
     * Send an event with a specific event type
     */
    sendWithType(message, eventType) {
        if (!this.active) {
            return;
        }
        this.sequence += 1;
        const eventId = `${this.sessionId}:${this.sequence}`;
        const data = JSON.stringify(message);
        const event = {
            id: eventId,
            event: eventType,
            data,
        };
        // Add to buffer
        this.addToBuffer(event);
        // Write SSE formatted event
        this.writeEvent(event);
    }
    /**
     * Send a comment (used for keep-alive pings)
     */
    sendComment(comment) {
        if (!this.active) {
            return;
        }
        try {
            this.res.write(`: ${comment}\n\n`);
        }
        catch {
            this.active = false;
            this.stopKeepAlive();
        }
    }
    /**
     * Replay a raw SSE event (preserves original event ID)
     * Used for replaying buffered events on reconnection
     */
    replayEvent(event) {
        if (!this.active) {
            return;
        }
        // Update sequence to match replayed event
        const sequence = this.parseEventIdSequence(event.id);
        if (sequence !== null && sequence > this.sequence) {
            this.sequence = sequence;
        }
        // Write the event with its original ID
        this.writeEvent(event);
        // Add to current buffer for future replays
        this.addToBuffer(event);
    }
    /**
     * Parse event ID to extract sequence number
     */
    parseEventIdSequence(eventId) {
        const colonIndex = eventId.lastIndexOf(':');
        if (colonIndex === -1) {
            return null;
        }
        const sequenceStr = eventId.substring(colonIndex + 1);
        const sequence = parseInt(sequenceStr, 10);
        return isNaN(sequence) ? null : sequence;
    }
    /**
     * Close the SSE stream
     */
    close() {
        if (!this.active) {
            return;
        }
        this.active = false;
        this.stopKeepAlive();
        try {
            this.res.end();
        }
        catch {
            // Already closed
        }
    }
    /**
     * Write an SSE event to the response
     */
    writeEvent(event) {
        try {
            let output = '';
            if (event.id) {
                output += `id: ${event.id}\n`;
            }
            if (event.event) {
                output += `event: ${event.event}\n`;
            }
            // Handle multi-line data
            const dataLines = event.data.split('\n');
            for (const line of dataLines) {
                output += `data: ${line}\n`;
            }
            output += '\n';
            this.res.write(output);
        }
        catch {
            this.active = false;
            this.stopKeepAlive();
        }
    }
    /**
     * Add event to buffer, maintaining max size
     */
    addToBuffer(event) {
        this.eventBuffer.push(event);
        // Trim buffer if it exceeds max size
        while (this.eventBuffer.length > this.bufferSize) {
            this.eventBuffer.shift();
        }
    }
    /**
     * Stop keep-alive timer
     */
    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }
}
// =============================================================================
// SSEManager Class
// =============================================================================
/**
 * Manages SSE streams for multiple sessions with replay support
 */
export class SSEManager {
    streams = new Map();
    bufferSize;
    keepAliveInterval;
    constructor(options) {
        this.bufferSize = options?.bufferSize ?? 100;
        this.keepAliveInterval = options?.keepAliveInterval ?? 30000;
    }
    /**
     * Create a new SSE stream for a session
     */
    createStream(sessionId, res) {
        // Close existing stream if any
        this.closeStream(sessionId);
        const stream = new SSEStream(res, sessionId, {
            bufferSize: this.bufferSize,
            keepAliveInterval: this.keepAliveInterval,
        });
        this.streams.set(sessionId, stream);
        // Clean up when stream closes
        res.on('close', () => {
            this.streams.delete(sessionId);
        });
        return stream;
    }
    /**
     * Get an existing stream for a session
     */
    getStream(sessionId) {
        return this.streams.get(sessionId);
    }
    /**
     * Send an event to a specific session
     */
    sendEvent(sessionId, message) {
        const stream = this.streams.get(sessionId);
        if (!stream || !stream.isActive) {
            return false;
        }
        stream.send(message);
        return true;
    }
    /**
     * Send an event with a specific type to a session
     */
    sendEventWithType(sessionId, message, eventType) {
        const stream = this.streams.get(sessionId);
        if (!stream || !stream.isActive) {
            return false;
        }
        stream.sendWithType(message, eventType);
        return true;
    }
    /**
     * Handle reconnection with Last-Event-Id header
     * Creates a new stream and replays events after the given event ID
     */
    handleReconnect(sessionId, lastEventId, res) {
        // Get existing stream's buffer before closing
        const existingStream = this.streams.get(sessionId);
        const existingBuffer = existingStream?.getBuffer() ?? [];
        // Create new stream
        const stream = this.createStream(sessionId, res);
        // Parse last event ID to get sequence number
        const lastSequence = this.parseEventIdSequence(lastEventId);
        if (lastSequence !== null) {
            // Replay events after the last received sequence
            this.replayEvents(stream, existingBuffer, lastSequence);
        }
        return stream;
    }
    /**
     * Close stream for a session
     */
    closeStream(sessionId) {
        const stream = this.streams.get(sessionId);
        if (stream) {
            stream.close();
            this.streams.delete(sessionId);
        }
    }
    /**
     * Close all streams
     */
    closeAll() {
        for (const [sessionId, stream] of this.streams) {
            stream.close();
            this.streams.delete(sessionId);
        }
    }
    /**
     * Get number of active streams
     */
    get size() {
        return this.streams.size;
    }
    /**
     * Check if a session has an active stream
     */
    hasStream(sessionId) {
        const stream = this.streams.get(sessionId);
        return stream !== undefined && stream.isActive;
    }
    /**
     * Parse event ID to extract sequence number
     * Event ID format: "<session>:<sequence>"
     */
    parseEventIdSequence(eventId) {
        const colonIndex = eventId.lastIndexOf(':');
        if (colonIndex === -1) {
            return null;
        }
        const sequenceStr = eventId.substring(colonIndex + 1);
        const sequence = parseInt(sequenceStr, 10);
        if (isNaN(sequence)) {
            return null;
        }
        return sequence;
    }
    /**
     * Replay buffered events to a stream after a given sequence
     */
    replayEvents(stream, buffer, afterSequence) {
        for (const event of buffer) {
            const eventSequence = this.parseEventIdSequence(event.id);
            if (eventSequence !== null && eventSequence > afterSequence) {
                stream.replayEvent(event);
            }
        }
    }
}
/**
 * @deprecated Use SSEStream instead
 */
export class SseStream {
    buffer = [];
    constructor(_options) {
        // Legacy placeholder - use SSEStream instead
    }
    getBuffer() {
        return this.buffer;
    }
    send(_message) {
        // Legacy placeholder - use SSEStream instead
    }
    replay(_fromId) {
        return [];
    }
    close() {
        // Legacy placeholder
    }
}
//# sourceMappingURL=sse.js.map