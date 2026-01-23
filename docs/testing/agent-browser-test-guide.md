# UI Workflow Testing with Agent-Browser CLI

This guide documents how to test the MCP Agent Chat UI using the `agent-browser` CLI tool.

## Prerequisites

1. **Backend Server Running** (with OpenRouter API key for chat)
   ```bash
   OPENROUTER_API_KEY=<your-key> AUTH_ENABLED=true OAUTH_SERVER_ENABLED=true OAUTH_TEST_USER=admin OAUTH_TEST_PASSWORD=secret123 MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev
   ```

2. **Frontend Server Running**
   ```bash
   cd packages/ui
   VITE_AUTH_REQUIRED=true npm run dev
   ```

3. **agent-browser CLI** installed globally
   ```bash
   npm install -g agent-browser

   # Install browser binaries (first time only)
   agent-browser install
   ```

4. **Screenshots Directory**
   ```bash
   mkdir -p test-screenshots
   ```

## Quick Start (Recommended)

Use named sessions (`--session`) to maintain browser state and allow clean restarts:

```bash
# Start a fresh session
agent-browser --session mytest open http://localhost:5173

# All subsequent commands use the same session
agent-browser --session mytest snapshot
agent-browser --session mytest click @e2

# Close when done
agent-browser --session mytest close
```

## Test Workflow

### Step 1: Open Browser and Navigate

```bash
# Open the app with a named session
agent-browser --session test open http://localhost:5173

# Verify page loaded - should show login screen
agent-browser --session test snapshot
```

**Expected snapshot:**
```
- document:
  - heading "MCP Agent Chat"
  - paragraph: Sign in to start chatting with the agent
  - button "Sign In" [ref=e2]
```

### Step 2: Capture Login Screen

```bash
agent-browser --session test screenshot test-screenshots/01-login-screen.png
```

### Step 3: Click Sign In

```bash
# Click Sign In button
agent-browser --session test click @e2

# Wait for OAuth form
sleep 2

# Verify OAuth form loaded
agent-browser --session test snapshot
```

**Expected snapshot:**
```
- document:
  - heading "Sign In"
  - textbox "Username" [ref=e2]
  - textbox "Password" [ref=e3]
  - button "Sign In" [ref=e4]
  - text: "Default: demo / demo"
```

### Step 4: Capture OAuth Form

```bash
agent-browser --session test screenshot test-screenshots/02-oauth-form.png
```

### Step 5: Enter Credentials

```bash
# Fill username
agent-browser --session test fill @e2 "admin"

# Fill password
agent-browser --session test fill @e3 "secret123"

# Capture filled form
agent-browser --session test screenshot test-screenshots/03-credentials-filled.png
```

### Step 6: Submit Login

```bash
# Click Sign In
agent-browser --session test click @e4

# Wait for redirect
sleep 3

# Verify welcome screen
agent-browser --session test snapshot
```

> **Note:** OAuth login occasionally fails on the first attempt with "Authorization code is invalid or expired". If this happens, click Sign In again and re-enter credentials. The second attempt typically succeeds.

**Expected snapshot:**
```
- document:
  - heading "MCP Agent Chat"
  - button "Sign Out" [ref=e2]
  - button "Show Tools" [ref=e3]
  - heading "Welcome to MCP Agent"
  - textbox "Type a message..." [ref=e9]
  - button "Send message" [ref=e10]
```

### Step 7: Capture Welcome Screen

```bash
agent-browser --session test screenshot test-screenshots/04-welcome-logged-in.png
```

### Step 8: Test Calculator Tool

```bash
# Get current refs (textbox and send button refs may vary)
agent-browser --session test snapshot

# Type calculator question
agent-browser --session test fill @e9 "What is 42 * 17?"

# Click send
agent-browser --session test click @e10

# Wait for AI response (may take 10-15 seconds)
sleep 15

# Verify response content
agent-browser --session test eval "document.body.innerText"

# Capture response
agent-browser --session test screenshot test-screenshots/05-calculator-response.png
```

**Expected response:** "The result of 42 * 17 is 714." with "Tool: calculate" indicator

### Step 9: Test Fortune Teller Tool

```bash
# Get updated refs
agent-browser --session test snapshot

# Type fortune request (use the textbox ref from snapshot)
agent-browser --session test fill @e4 "Tell me my fortune about career"

# Send message
agent-browser --session test click @e5

# Wait for response
sleep 15

# Verify and capture
agent-browser --session test eval "document.body.innerText"
agent-browser --session test screenshot test-screenshots/06-fortune-response.png
```

**Expected:** Fortune message with "Tool: tell_fortune" indicator (e.g., "The universe prepares a role you never imagined.")

### Step 10: Test Dice Roller Tool

```bash
# Get refs
agent-browser --session test snapshot

# Type dice roll
agent-browser --session test fill @e4 "Roll 2d20"

# Send
agent-browser --session test click @e5

# Wait and capture
sleep 15
agent-browser --session test eval "document.body.innerText"
agent-browser --session test screenshot test-screenshots/07-dice-response.png
```

**Expected:** Two d20 results with total (e.g., "I rolled 2d20 and got a 19 and a 6, for a total of 25."), "Tool: roll_dice" indicator

### Step 11: View Available Tools

```bash
# Get refs for Show Tools button
agent-browser --session test snapshot

# Click Show Tools (typically @e3)
agent-browser --session test click @e3

# Wait for panel
sleep 1

# Capture tools panel
agent-browser --session test screenshot test-screenshots/08-tools-panel.png
agent-browser --session test snapshot
```

**Expected tools:**
- `calculate` - arithmetic operations (operation, a, b)
- `roll_dice` - tabletop dice rolling (notation)
- `tell_fortune` - fortune telling (category, mood)

### Step 12: Sign Out

```bash
# Get refs
agent-browser --session test snapshot

# Click Sign Out (typically @e2)
agent-browser --session test click @e2

# Wait
sleep 2

# Capture logged out state
agent-browser --session test screenshot test-screenshots/09-signed-out.png

# Verify back at login
agent-browser --session test snapshot
```

**Expected:** Back to login screen with "Sign In" button

### Step 13: Close Browser

```bash
agent-browser --session test close
```

## Chaining Commands

For efficiency, you can chain multiple commands:

```bash
# Login flow in one line
agent-browser --session test fill @e2 "admin" && \
agent-browser --session test fill @e3 "secret123" && \
agent-browser --session test click @e4 && \
sleep 3 && \
agent-browser --session test snapshot
```

## Why Interactive Testing is Recommended

A static bash script for this test workflow is **not recommended** because:

1. **Dynamic element refs** - The `@e2`, `@e3` refs change every time the page updates. A pre-written script with hardcoded refs will fail.

2. **AI response timing** - Chat responses have variable timing (10-20 seconds). Fixed `sleep` values may be too short or unnecessarily long.

3. **State verification** - You need to verify each step succeeded before proceeding. `agent-browser snapshot` lets you confirm the expected state.

4. **OAuth timing sensitivity** - The OAuth flow occasionally fails and requires retry.

**Best practice:** Run each step interactively, using `agent-browser snapshot` before each interaction to get current element refs.

## Useful Commands Reference

| Command | Description |
|---------|-------------|
| `agent-browser --session <name> open <url>` | Navigate to URL in named session |
| `agent-browser --session <name> click <selector>` | Click element |
| `agent-browser --session <name> fill <selector> <text>` | Clear and fill input field |
| `agent-browser --session <name> type <selector> <text>` | Type into element (appends) |
| `agent-browser --session <name> snapshot` | Get accessibility tree with refs |
| `agent-browser --session <name> snapshot -i` | Interactive elements only |
| `agent-browser --session <name> screenshot <path>` | Save screenshot |
| `agent-browser --session <name> eval <js>` | Execute JavaScript |
| `agent-browser --session <name> console` | View console logs |
| `agent-browser --session <name> close` | Close browser session |
| `agent-browser session list` | List active sessions |

## Troubleshooting

### Browser fails to start / "Daemon failed to start"
```bash
# Install browser binaries
agent-browser install

# If npm permission errors occur:
sudo chown -R $(whoami) ~/.npm
agent-browser install
```

### Chat responses not appearing (400 errors)
This usually means the backend's MCP session is stale. **Restart the backend server:**
```bash
# Ctrl+C the running server, then restart:
OPENROUTER_API_KEY=<key> AUTH_ENABLED=true OAUTH_SERVER_ENABLED=true ... npm run dev
```

Then start a fresh browser session:
```bash
agent-browser --session test close
agent-browser --session newtest open http://localhost:5173
```

### OAuth login fails with "Authorization code is invalid or expired"
- This is a known timing issue with the PKCE flow
- Simply click Sign In again and re-enter credentials
- The second attempt typically succeeds

### Chat takes too long or times out
- Increase sleep time: `sleep 20` or `sleep 30`
- Check backend logs for errors
- Verify OPENROUTER_API_KEY is set correctly

### Element refs change unexpectedly
- Always run `agent-browser --session <name> snapshot` before interacting
- Refs are dynamic and change when page content updates
- After sending a message, get new snapshot before next interaction

### Verify page content without screenshot
```bash
# Get all text content
agent-browser --session test eval "document.body.innerText"

# Check specific element
agent-browser --session test eval "document.querySelector('.chat-message').textContent"
```
