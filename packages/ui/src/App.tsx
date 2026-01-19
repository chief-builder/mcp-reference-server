import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatView } from '@/components/chat';
import { useChat } from '@/hooks/useChat';
import type { Message } from '@/components/chat';

const initialMessages: Message[] = [
  {
    id: 'test-1',
    role: 'user',
    content: 'Hello! Can you help me understand how this chat works?',
    timestamp: new Date('2024-01-01T10:00:00'),
  },
  {
    id: 'test-2',
    role: 'assistant',
    content: `Of course! This is a **basic chat interface** with the following features:

- User messages appear on the right with a distinct background
- Assistant messages appear on the left with markdown support
- You can type a message and press Enter or click Send

Here's an example of code highlighting:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

Feel free to try it out!`,
    timestamp: new Date('2024-01-01T10:00:05'),
  },
  {
    id: 'test-3',
    role: 'user',
    content: 'That looks great! Thanks for the explanation.',
    timestamp: new Date('2024-01-01T10:00:10'),
  },
];

function App() {
  const { messages, addMessage } = useChat({ initialMessages });

  const handleSendMessage = (content: string) => {
    addMessage(content, 'user');
    // In the future, this would trigger an API call to get assistant response
    // For now, just add a mock assistant response
    setTimeout(() => {
      addMessage('Thanks for your message! This is a static demo response.', 'assistant');
    }, 500);
  };

  return (
    <div className="h-screen bg-background p-4">
      <Card className="mx-auto flex h-full max-w-3xl flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>MCP Agent Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ChatView messages={messages} onSendMessage={handleSendMessage} className="h-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
