import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatView } from '@/components/chat';
import { useChat } from '@/hooks/useChat';

function App() {
  const { messages, sendMessage, cancel, isLoading, isStreaming, streamingMessageId, error } = useChat();

  return (
    <div className="h-screen bg-background p-4">
      <Card className="mx-auto flex h-full max-w-3xl flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>MCP Agent Chat</CardTitle>
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

export default App;
