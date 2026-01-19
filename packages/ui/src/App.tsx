import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChatView } from '@/components/chat';
import { useChat } from '@/hooks/useChat';
import {
  isAuthenticated as checkIsAuthenticated,
  login,
  logout as authLogout,
  handleCallback,
} from '@/lib/auth';
import { onAuthChange } from '@/lib/api';

// =============================================================================
// Auth Configuration
// =============================================================================

/**
 * Check if authentication is required
 * In development, this can be disabled via env var
 */
const AUTH_REQUIRED = import.meta.env.VITE_AUTH_REQUIRED !== 'false';

// =============================================================================
// Components
// =============================================================================

/**
 * Login screen shown when user is not authenticated
 */
function LoginScreen({ onLogin, error }: { onLogin: () => void; error?: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>MCP Agent Chat</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to start chatting with the agent
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {error && (
            <div className="w-full rounded bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button onClick={onLogin} className="w-full">
            Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Loading screen shown during auth callback processing
 */
function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Connection status indicator component
 */
function ConnectionStatusIndicator({
  status,
  retryCount,
}: {
  status: 'connected' | 'disconnected' | 'reconnecting';
  retryCount: number;
}) {
  if (status === 'connected') return null;

  return (
    <div
      className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${
        status === 'reconnecting'
          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      {status === 'reconnecting' && (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
      )}
      {status === 'reconnecting'
        ? `Connection lost. Retrying... (${retryCount}/3)`
        : 'Disconnected'}
    </div>
  );
}

/**
 * Rate limit countdown component
 */
function RateLimitCountdown({
  seconds,
  onComplete,
}: {
  seconds: number;
  onComplete: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (remaining <= 0) {
      onCompleteRef.current();
      return;
    }

    const timer = setInterval(() => {
      setRemaining((r) => r - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  return (
    <div className="flex items-center gap-2 rounded bg-yellow-100 p-2 dark:bg-yellow-900/30">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
      <span className="flex-1 text-sm text-yellow-800 dark:text-yellow-200">
        Rate limited. Retry in {remaining}s...
      </span>
    </div>
  );
}

/**
 * Parse rate limit seconds from error message
 */
function parseRateLimitSeconds(error: string): number | null {
  const match = error.match(/wait\s+(\d+)\s*seconds?/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Error display with retry button
 */
function ErrorDisplay({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  const [showCountdown, setShowCountdown] = useState(false);
  const rateLimitSeconds = parseRateLimitSeconds(error);
  const isRateLimited = error.toLowerCase().includes('rate limit') && rateLimitSeconds;

  useEffect(() => {
    if (isRateLimited) {
      setShowCountdown(true);
    }
  }, [isRateLimited]);

  // Show countdown for rate limit errors
  if (showCountdown && rateLimitSeconds && onRetry) {
    return (
      <RateLimitCountdown
        seconds={rateLimitSeconds}
        onComplete={() => {
          setShowCountdown(false);
          onRetry();
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded bg-destructive/10 p-2">
      <span className="flex-1 text-sm text-destructive">{error}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Main chat interface with logout button
 */
function ChatInterface({ onLogout }: { onLogout: () => void }) {
  const {
    messages,
    sendMessage,
    cancel,
    retry,
    isLoading,
    isStreaming,
    streamingMessageId,
    error,
    connectionStatus,
    retryCount,
  } = useChat();

  // Determine if we can retry (has an error and not currently loading)
  const canRetry = error && !isLoading && !isStreaming;

  return (
    <div className="h-screen bg-background p-2 sm:p-4">
      <Card className="mx-auto flex h-full max-w-3xl flex-col">
        <CardHeader className="shrink-0 px-3 py-2 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl">MCP Agent Chat</CardTitle>
            <div className="flex items-center gap-2">
              <ConnectionStatusIndicator status={connectionStatus} retryCount={retryCount} />
              {AUTH_REQUIRED && (
                <Button variant="outline" size="sm" onClick={onLogout}>
                  <span className="hidden sm:inline">Sign Out</span>
                  <span className="sm:hidden">Exit</span>
                </Button>
              )}
            </div>
          </div>
          {error && <ErrorDisplay error={error} onRetry={canRetry ? retry : undefined} />}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ChatView
            messages={messages}
            onSendMessage={sendMessage}
            onCancel={cancel}
            disabled={isLoading}
            isLoading={isLoading}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            className="h-full"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main App
// =============================================================================

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'callback';

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | undefined>();

  // Check authentication state on mount and handle callback
  useEffect(() => {
    const checkAuth = async () => {
      // Check if this is an OAuth callback
      const url = new URL(window.location.href);
      if (url.pathname === '/callback' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
        setAuthState('callback');

        const result = await handleCallback();
        if (result.success) {
          // Redirect to return path
          window.history.replaceState({}, '', result.returnPath ?? '/');
          setAuthState('authenticated');
        } else {
          // Clear URL and show error
          window.history.replaceState({}, '', '/');
          setAuthError(result.error);
          setAuthState('unauthenticated');
        }
        return;
      }

      // Check if already authenticated
      if (!AUTH_REQUIRED || checkIsAuthenticated()) {
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    };

    checkAuth();
  }, []);

  // Subscribe to auth state changes (e.g., forced logout on 401)
  useEffect(() => {
    const unsubscribe = onAuthChange(() => {
      if (!checkIsAuthenticated()) {
        setAuthState('unauthenticated');
        setAuthError('Your session has expired. Please sign in again.');
      }
    });

    return unsubscribe;
  }, []);

  const handleLogin = useCallback(() => {
    setAuthError(undefined);
    login();
  }, []);

  const handleLogout = useCallback(() => {
    authLogout();
    setAuthState('unauthenticated');
  }, []);

  // Render based on auth state
  switch (authState) {
    case 'loading':
      return <LoadingScreen message="Checking authentication..." />;

    case 'callback':
      return <LoadingScreen message="Completing sign in..." />;

    case 'unauthenticated':
      return <LoginScreen onLogin={handleLogin} error={authError} />;

    case 'authenticated':
      return <ChatInterface onLogout={handleLogout} />;
  }
}

export default App;
