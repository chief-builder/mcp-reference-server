import { useState, useEffect, useCallback } from 'react';
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
 * Main chat interface with logout button
 */
function ChatInterface({ onLogout }: { onLogout: () => void }) {
  const { messages, sendMessage, cancel, isLoading, isStreaming, streamingMessageId, error } =
    useChat();

  return (
    <div className="h-screen bg-background p-4">
      <Card className="mx-auto flex h-full max-w-3xl flex-col">
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle>MCP Agent Chat</CardTitle>
            {AUTH_REQUIRED && (
              <Button variant="outline" size="sm" onClick={onLogout}>
                Sign Out
              </Button>
            )}
          </div>
          {error && (
            <div className="mt-2 rounded bg-destructive/10 p-2 text-sm text-destructive">
              Error: {error}
            </div>
          )}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ChatView
            messages={messages}
            onSendMessage={sendMessage}
            onCancel={cancel}
            disabled={isLoading}
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
