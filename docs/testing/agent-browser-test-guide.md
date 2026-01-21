# UI Workflow Testing with Agent-Browser CLI

This guide documents how to test the MCP Agent Chat UI using the `agent-browser` CLI tool.

## Prerequisites

1. **Backend Server Running**
   ```bash
   AUTH_ENABLED=true OAUTH_SERVER_ENABLED=true OAUTH_TEST_USER=admin OAUTH_TEST_PASSWORD=secret123 MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev
   ```

2. **Frontend Server Running**
   ```bash
   cd packages/ui
   VITE_AUTH_REQUIRED=true npm run dev
   ```

3. **agent-browser CLI** installed globally
   ```bash
   npm install -g agent-browser
   ```

4. **Screenshots Directory**
   ```bash
   mkdir -p test-screenshots
   ```

## Test Workflow

### Step 1: Open Browser and Navigate

```bash
# Open the app
agent-browser open http://localhost:5173

# Verify page loaded - should show login screen
agent-browser snapshot
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
agent-browser screenshot test-screenshots/01-login-screen.png
```

### Step 3: Click Sign In

```bash
# Click Sign In button
agent-browser click @e2

# Wait for OAuth form
sleep 2

# Verify OAuth form loaded
agent-browser snapshot
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
agent-browser screenshot test-screenshots/02-oauth-form.png
```

### Step 5: Enter Credentials

```bash
# Fill username
agent-browser fill @e2 "admin"

# Fill password
agent-browser fill @e3 "secret123"

# Capture filled form
agent-browser screenshot test-screenshots/03-credentials-filled.png
```

### Step 6: Submit Login

```bash
# Click Sign In
agent-browser click @e4

# Wait for redirect
sleep 3

# Verify welcome screen
agent-browser snapshot
```

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
agent-browser screenshot test-screenshots/04-welcome-logged-in.png
```

### Step 8: Test Calculator Tool

```bash
# Get current refs
agent-browser snapshot

# Type calculator question
agent-browser fill @e9 "What is 42 * 17?"

# Click send (ref may vary, check snapshot)
agent-browser click @e10

# Wait for AI response
sleep 10

# Capture response
agent-browser screenshot test-screenshots/05-calculator-response.png

# Verify response content
agent-browser eval "document.body.innerText"
```

**Expected response:** "714" with "Tool: calculate" indicator

### Step 9: Test Fortune Teller Tool

```bash
# Get updated refs
agent-browser snapshot

# Type fortune request
agent-browser fill @e<textbox_ref> "Tell me my fortune about career"

# Send message
agent-browser click @e<send_ref>

# Wait for response
sleep 10

# Capture (should ask for mood)
agent-browser screenshot test-screenshots/06-fortune-mood-ask.png

# Reply with mood
agent-browser fill @e<textbox_ref> "mysterious"
agent-browser click @e<send_ref>

# Wait and capture fortune
sleep 10
agent-browser screenshot test-screenshots/07-fortune-response.png
```

**Expected:** Fortune message with "Tool: tell_fortune" indicator

### Step 10: Test Dice Roller Tool

```bash
# Get refs
agent-browser snapshot

# Type dice roll
agent-browser fill @e<textbox_ref> "Roll 2d20"

# Send
agent-browser click @e<send_ref>

# Wait and capture
sleep 10
agent-browser screenshot test-screenshots/08-dice-response.png
```

**Expected:** Two d20 results with total, "Tool: roll_dice" indicator

### Step 11: View Available Tools

```bash
# Get refs for Show Tools button
agent-browser snapshot

# Click Show Tools
agent-browser click @e3

# Capture tools panel
agent-browser screenshot test-screenshots/09-tools-panel.png
```

**Expected tools:**
- `calculate` - arithmetic operations
- `roll_dice` - tabletop dice rolling
- `tell_fortune` - fortune telling

### Step 12: Sign Out

```bash
# Get refs
agent-browser snapshot

# Click Sign Out
agent-browser click @e2

# Wait
sleep 2

# Capture logged out state
agent-browser screenshot test-screenshots/10-signed-out.png

# Verify back at login
agent-browser snapshot
```

**Expected:** Back to login screen with "Sign In" button

### Step 13: Close Browser

```bash
agent-browser close
```

## Why Interactive Testing is Recommended

A static bash script for this test workflow is **not recommended** because:

1. **Dynamic element refs** - The `@e2`, `@e3` refs change every time the page updates. A pre-written script with hardcoded refs will fail.

2. **AI response timing** - Chat responses have variable timing. Fixed `sleep` values may be too short or unnecessarily long.

3. **State verification** - You need to verify each step succeeded before proceeding. `agent-browser snapshot` lets you confirm the expected state.

**Best practice:** Run each step interactively, using `agent-browser snapshot` before each interaction to get current element refs.

## Useful Commands Reference

| Command | Description |
|---------|-------------|
| `agent-browser open <url>` | Navigate to URL |
| `agent-browser click <selector>` | Click element |
| `agent-browser fill <selector> <text>` | Fill input field |
| `agent-browser type <selector> <text>` | Type into element |
| `agent-browser snapshot` | Get accessibility tree with refs |
| `agent-browser screenshot <path>` | Save screenshot |
| `agent-browser wait <ms>` | Wait for time |
| `agent-browser eval <js>` | Execute JavaScript |
| `agent-browser get text <selector>` | Get element text |
| `agent-browser close` | Close browser |

## Troubleshooting

### Chat responses not appearing
- Check if backend is running: `curl http://localhost:3000/`
- Check browser console: `agent-browser eval "console.log('test')"`
- Try longer wait times for AI responses

### OAuth login fails
- Verify credentials: `OAUTH_TEST_USER=admin OAUTH_TEST_PASSWORD=secret123`
- Check backend OAuth is enabled: `OAUTH_SERVER_ENABLED=true`

### Element refs change
- Always run `agent-browser snapshot` before interacting
- Refs are dynamic and change when page updates
