# UI Workflow Test Instructions

## Setup

### 1. Start Backend
```bash
AUTH_ENABLED=true OAUTH_SERVER_ENABLED=true MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev
```

### 2. Start Frontend
```bash
cd packages/ui
VITE_AUTH_REQUIRED=true npm run dev
```

### 3. Test Credentials
- Default: `demo` / `demo`
- Custom: Set `OAUTH_TEST_USER` and `OAUTH_TEST_PASSWORD` env vars

## Test Workflow

### Step 1: Login
1. Open `http://localhost:5173`
2. Click **Sign In**
3. Enter credentials (`demo` / `demo`)
4. Click **Sign In** to submit
5. Verify: Chat interface loads with "Welcome to MCP Agent"

### Step 2: General Knowledge Question
Test that the agent can answer questions without tools:
```
User: Who is the best NBA player?
Expected: Agent provides an answer discussing players like Michael Jordan,
LeBron James, etc. without using any tools.
```

### Step 3: Calculator Tool
```
User: What is 42 * 17?
Expected: 714
Verify: "Tool: calculate" indicator shown
```

### Step 4: Fortune Teller Tool
```
User: Tell me my fortune about career
Expected: Agent asks for mood preference (optimistic, mysterious, cautious)

User: mysterious
Expected: A fortune message is displayed
Verify: "Tool: tell_fortune" indicator shown
```

### Step 5: Dice Roller Tool
```
User: Roll 2d20
Expected: Two d20 results with total (e.g., "8 and 18, for a total of 26")
Verify: "Tool: roll_dice" indicator shown
```

### Step 6: View Available Tools
1. Click **Show Tools** button
2. Verify three tools listed: `calculate`, `roll_dice`, `tell_fortune`
3. Click **Hide Tools** to collapse

### Step 7: Sign Out
1. Click **Sign Out**
2. Verify: Returns to login screen
