# UI Workflow Testing with Chrome MCP Tools

This guide documents how to test the MCP Agent Chat UI using Chrome MCP browser automation tools.

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

3. **Chrome MCP Extension** installed and connected to Claude Code

4. **Screenshots Directory**
   ```bash
   mkdir -p test-screenshots
   ```

## Test Workflow

### Step 1: Open Browser and Navigate

```
# Get tab context (creates new tab group if needed)
mcp__claude-in-chrome__tabs_context_mcp(createIfEmpty: true)

# Create a new tab for testing
mcp__claude-in-chrome__tabs_create_mcp()

# Navigate to the app
mcp__claude-in-chrome__navigate(url: "http://localhost:5173", tabId: <TAB_ID>)

# Wait for page load
mcp__claude-in-chrome__computer(action: "wait", duration: 2, tabId: <TAB_ID>)
```

**Expected:** Page loads with "MCP Agent Chat" title

### Step 2: Capture Login Screen

```
# Take screenshot of login screen
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected screenshot:** Login screen with "Sign in to start chatting with the agent" and "Sign In" button

### Step 3: Click Sign In

```
# Read page to find Sign In button
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")

# Click Sign In button (typically ref_1 or use coordinates)
mcp__claude-in-chrome__computer(action: "left_click", coordinate: [746, 463], tabId: <TAB_ID>)

# Wait for OAuth form to load
mcp__claude-in-chrome__computer(action: "wait", duration: 2, tabId: <TAB_ID>)
```

**Expected:** Redirects to OAuth login form at `/oauth/authorize`

### Step 4: Capture OAuth Form

```
# Take screenshot of OAuth form
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected screenshot:** "Sign In" form with Username, Password fields and "Default: demo / demo" hint

### Step 5: Enter Credentials

```
# Read page to get form element refs
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")
```

**Expected refs:**
```
textbox "Username" [ref_1]
textbox "Password" [ref_2]
button "Sign In" [ref_3]
```

```
# Fill username
mcp__claude-in-chrome__form_input(ref: "ref_1", value: "admin", tabId: <TAB_ID>)

# Fill password
mcp__claude-in-chrome__form_input(ref: "ref_2", value: "secret123", tabId: <TAB_ID>)

# Take screenshot of filled form
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

### Step 6: Submit Login

```
# Click Sign In button
mcp__claude-in-chrome__computer(action: "left_click", ref: "ref_3", tabId: <TAB_ID>)

# Wait for redirect
mcp__claude-in-chrome__computer(action: "wait", duration: 3, tabId: <TAB_ID>)
```

**Expected:** Redirects back to `http://localhost:5173/` with authenticated session

### Step 7: Capture Welcome Screen

```
# Take screenshot - should show "Welcome to MCP Agent"
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)

# Verify page elements
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")
```

**Expected refs:**
```
button "Sign Out" [ref_1]
button "Show Tools" [ref_2]
textbox "Type a message..." [ref_7]
button (send) [ref_8]
```

**Expected screenshot:** "Welcome to MCP Agent" with suggestion cards and chat input

### Step 8: Test Calculator Tool

```
# Type calculator question
mcp__claude-in-chrome__form_input(ref: "ref_7", value: "What is 42 * 17?", tabId: <TAB_ID>)

# Click send button
mcp__claude-in-chrome__computer(action: "left_click", ref: "ref_8", tabId: <TAB_ID>)

# Wait for AI response
mcp__claude-in-chrome__computer(action: "wait", duration: 10, tabId: <TAB_ID>)

# Take screenshot
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected:** Response showing "714" with "Tool: calculate" indicator

### Step 9: Test Fortune Teller Tool

```
# Get updated refs (they may change after chat)
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")

# Type fortune request
mcp__claude-in-chrome__form_input(ref: "<textbox_ref>", value: "Tell me my fortune about career", tabId: <TAB_ID>)

# Send message
mcp__claude-in-chrome__computer(action: "left_click", ref: "<send_ref>", tabId: <TAB_ID>)

# Wait for response (agent asks for mood)
mcp__claude-in-chrome__computer(action: "wait", duration: 10, tabId: <TAB_ID>)
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected:** Agent asks "What kind of mood would you like the fortune to be? (optimistic, mysterious, or cautious)"

```
# Reply with mood preference
mcp__claude-in-chrome__form_input(ref: "<textbox_ref>", value: "mysterious", tabId: <TAB_ID>)
mcp__claude-in-chrome__computer(action: "left_click", ref: "<send_ref>", tabId: <TAB_ID>)

# Wait and capture fortune result
mcp__claude-in-chrome__computer(action: "wait", duration: 10, tabId: <TAB_ID>)
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected:** Fortune message with "Tool: tell_fortune" indicator

### Step 10: Test Dice Roller Tool

```
# Get refs
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")

# Type dice roll request
mcp__claude-in-chrome__form_input(ref: "<textbox_ref>", value: "Roll 2d20", tabId: <TAB_ID>)

# Send and wait
mcp__claude-in-chrome__computer(action: "left_click", ref: "<send_ref>", tabId: <TAB_ID>)
mcp__claude-in-chrome__computer(action: "wait", duration: 10, tabId: <TAB_ID>)

# Take screenshot
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected:** Two d20 results with total (e.g., "13 and 5, for a total of 18") with "Tool: roll_dice" indicator

### Step 11: View Available Tools

```
# Get refs
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")

# Click Show Tools button
mcp__claude-in-chrome__computer(action: "left_click", ref: "ref_2", tabId: <TAB_ID>)

# Wait for panel
mcp__claude-in-chrome__computer(action: "wait", duration: 1, tabId: <TAB_ID>)

# Take screenshot
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected tools panel:**
- `calculate` - Perform basic arithmetic operations
- `roll_dice` - Roll dice using standard tabletop notation
- `tell_fortune` - Reveal a fortune for the querent

### Step 12: Sign Out

```
# Get refs (Show Tools button becomes Hide Tools, Sign Out is still ref_1)
mcp__claude-in-chrome__read_page(tabId: <TAB_ID>, filter: "interactive")

# Click Sign Out button
mcp__claude-in-chrome__computer(action: "left_click", ref: "ref_1", tabId: <TAB_ID>)

# Wait for logout
mcp__claude-in-chrome__computer(action: "wait", duration: 2, tabId: <TAB_ID>)

# Take screenshot
mcp__claude-in-chrome__computer(action: "screenshot", tabId: <TAB_ID>)
```

**Expected:** Back to login screen with "Sign In" button

### Step 13: End Test Session

The Chrome MCP browser session persists until the tab group is closed or the extension is disconnected. You can:

- Leave the tab open for further testing
- Close the tab manually in Chrome
- Use `mcp__claude-in-chrome__navigate` to go to a different URL

## Saving Screenshots to Files

Chrome MCP screenshots are captured with IDs (e.g., `ss_12345abc`) and displayed inline. To save them to files, use JavaScript to capture and download:

```
mcp__claude-in-chrome__javascript_tool(
  action: "javascript_exec",
  tabId: <TAB_ID>,
  text: `
    async function captureAndDownload(filename) {
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
      }
      const canvas = await html2canvas(document.body);
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      return 'Downloaded: ' + filename;
    }
    captureAndDownload('01-login-screen.png');
  `
)
```

Screenshots will be downloaded to Chrome's default download folder.

## Why Interactive Testing is Recommended

A scripted/automated approach is **not recommended** because:

1. **Dynamic element refs** - The `ref_1`, `ref_2` refs change every time the page updates. You must run `read_page` before each interaction.

2. **AI response timing** - Chat responses have variable timing. Fixed wait durations may be too short or unnecessarily long.

3. **State verification** - You need to verify each step succeeded before proceeding. Screenshots and `read_page` let you confirm the expected state.

**Best practice:** Run each step interactively, using `read_page` before each interaction to get current element refs.

## Useful Tools Reference

| Tool | Description |
|------|-------------|
| `tabs_context_mcp` | Get/create tab group context |
| `tabs_create_mcp` | Create new tab in group |
| `navigate` | Go to URL |
| `computer` (screenshot) | Capture screenshot |
| `computer` (left_click) | Click element by ref or coordinates |
| `computer` (wait) | Wait for duration |
| `read_page` | Get accessibility tree with refs |
| `form_input` | Fill form field |
| `javascript_tool` | Execute JavaScript |

## Expected Results Summary

| Step | Expected Outcome |
|------|-----------------|
| 1-2 | Login screen with "Sign In" button |
| 3-4 | OAuth form with username/password fields |
| 5-6 | Login succeeds, redirects to app |
| 7 | Welcome screen with "Sign Out", "Show Tools" |
| 8 | Calculator: "714" with "Tool: calculate" |
| 9 | Fortune: asks mood, then fortune with "Tool: tell_fortune" |
| 10 | Dice: two results with total, "Tool: roll_dice" |
| 11 | Tools panel: calculate, roll_dice, tell_fortune |
| 12 | Back to login screen |

## Troubleshooting

### Chat responses not appearing
- Check if backend is running and AI service is configured
- Try longer wait times (10-15 seconds)
- Check browser console for errors: `read_console_messages`

### OAuth login fails
- Verify credentials: `OAUTH_TEST_USER=admin OAUTH_TEST_PASSWORD=secret123`
- Check backend OAuth is enabled: `OAUTH_SERVER_ENABLED=true`

### Element refs not found
- Always run `read_page` before interacting with elements
- Refs change when page content updates
- Use coordinates as fallback if refs are unreliable
