import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>MCP Agent Chat</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Chat interface coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
