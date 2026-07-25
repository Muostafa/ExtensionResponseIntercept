# API Response Interceptor

A Chrome extension that lets you mock API responses on the fly. When a request matches one of your rules, the extension blocks it and returns a response you define — custom body, status code, and headers — without touching your backend. Useful for testing, prototyping against not-yet-built endpoints, and reproducing error conditions.

## Features

### Core Mocking

- **Request Mocking**: Matched requests are blocked and answered with a mock response — the real server is never contacted
- **Custom Response Body**: Return your own JSON, text, or binary (e.g. images) content
- **Status Code Override**: Return any status code (e.g. 200, 404, 500)
- **Response Header Control**: Add, set, or remove response headers on the mock
- **Response Delay**: Simulate slow networks with a configurable delay
- **Flexible URL Matching**: Wildcards, regex, exact matches, and contains patterns
- **HTTP Method Filtering**: Target specific methods (GET, POST, PUT, DELETE, PATCH)

### Three Ways to Add an API

- **From the network log**: Turn on "Intercept this tab", browse, then hit **+ Rule** on any captured request — the mock is prefilled with the response the server actually returned. Tick several rows to mock them all at once.
- **Paste a cURL command or a URL**: In DevTools → Network, right-click a request → **Copy** → **Copy as cURL**, then paste it into **Paste cURL**. Works with the bash, cmd, and PowerShell flavors, or with a bare URL.
- **By hand**: **Add Rule** in the popup opens the same compact dialog with nothing prefilled. Need the fields it doesn't have — group, priority, delay, response headers? **Full editor** carries whatever you've typed over to the Options form.

### Organization & Workflow

- **Rule Groups**: Organize rules into groups and toggle them together
- **Rule Priority**: Higher priority wins when several rules match the same request
- **Network Logging**: Inspect requests on intercepted tabs — URL, status, duration, headers, and captured response bodies. Logs survive a service-worker restart and are cleared when the tab or browser closes.
- **Guidance Strip**: The popup tells you when your rules can't fire — tab not intercepted, page not reloaded since attaching, or nothing enabled — with a one-click fix for each
- **Keyboard Shortcuts**: `Alt+Shift+I` toggles interception on the current tab from anywhere; `/`, `Esc`, and `Ctrl+Enter` drive the popup
- **Two Surfaces, One Split**: The popup is *this tab, right now* — interception, the network log, quick mocks, quick edits. The Options page is your library — groups, priorities, headers, pattern testing, import/export, settings. Anything the popup is too small for hands off to the same rule on the Options form instead of duplicating it.
- **Import/Export**: Save and share your rule configurations

## Installation

### From Source

1. Clone or download this repository
2. Generate icons (optional):
   - Open `create-icons.html` in your browser
   - Download the generated icons and place them in the `icons/` folder
   - Or use your own 16x16, 48x48, and 128x128 PNG icons
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right corner
5. Click "Load unpacked"
6. Select the extension directory

## Usage

### Quick Start

1. Click the extension icon in your browser toolbar
2. Turn on "Intercept this tab" (or press `Alt+Shift+I`) to enable interception for the current tab
3. **Reload the page** — requests it already made can't be mocked retroactively
4. Open the **Network** tab in the popup and hit **+ Rule** on the request you want to fake. The mock is prefilled with the response the server actually returned
5. Edit the body/status and save — the rule takes effect on the next matching request

Prefer to start from scratch? Use **Paste cURL** or **Add Rule** in the popup. Both open the same dialog, and both can hand off to the Options form with **Full editor** when you need groups, priorities, delays, or response headers.

The strip under the toggle tells you whenever something is stopping your rules
from firing (tab not intercepted, page not reloaded, no rules enabled) and gives
you the button that fixes it.

### Keyboard Shortcuts

| Key | Where | Does |
| --- | --- | --- |
| `Alt+Shift+I` | Anywhere in Chrome | Toggle interception on the current tab |
| `/` | Popup | Focus the search box |
| `Esc` | Popup | Close the open dialog, or clear the search |
| `Ctrl/Cmd+Enter` | Popup dialogs | Submit |

Re-bind the Chrome-wide shortcut at `chrome://extensions/shortcuts`.

### Creating Rules

#### URL Patterns

- **Wildcard**: `*://*/api/*` - Matches all API endpoints
- **Regex**: `https://api\.example\.com/v1/.*` - Use regex for complex patterns
- **Exact**: `https://example.com/api/users` - Match exact URLs
- **Contains**: `/api/data` - Match URLs containing this string

#### Response Body

Provide the mock response body returned for matched requests. For JSON content, enter the JSON you want the page to receive:

```json
{
  "status": "success",
  "data": "Mocked response"
}
```

You can also return plain text or binary content (e.g. an image) by choosing the appropriate Content-Type for the rule.

### Advanced Rule Configuration

#### Modifying Response Headers

Add header modifications to your rules:

- **Set/Add**: Create or update a header value
- **Remove**: Delete a specific header

Common use cases:

```
Action: Set
Header: Access-Control-Allow-Origin
Value: *

Action: Remove
Header: X-Frame-Options
```

#### Changing Status Codes

Override the response status code:

- Change 404 to 200 for testing
- Simulate error conditions (500, 503)
- Mock successful responses

### Example Rules

**Example 1: Mock an API Response**

- URL Pattern: `*://jsonplaceholder.typicode.com/todos/*`
- Match Type: Wildcard
- Response Body:

```json
{
  "id": 1,
  "title": "Mocked Todo",
  "completed": true,
  "userId": 1
}
```

**Example 2: Simulate a Server Error**

- URL Pattern: `*/api/flaky-endpoint`
- Match Type: Contains
- Status Code: `500`
- Response Body:

```json
{
  "error": "Internal Server Error"
}
```

**Example 3: Mock With Custom Headers**

- URL Pattern: `*://api.example.com/*`
- Match Type: Wildcard
- Status Code: `200`
- Headers:
  - Set `Access-Control-Allow-Origin` = `*`
  - Set `Cache-Control` = `no-store`
- Response Body: your mock JSON

> Note: header and status overrides apply to the mock response the extension returns — they do not modify a real server response, since matched requests never reach the server.

## Technical Details

### Architecture

The extension uses Chrome's Debugger API to intercept network requests. It drives two CDP domains, with a strict split of responsibilities:

- **Fetch** — mocking only. It is the only thing that pauses a request.
- **Network** — observation only. It feeds the network log and never blocks the page.

Modules:

1. **Service Worker** (`background/service-worker.js`): Manages debugger attachment, message routing, and which URLs Fetch is pointed at
2. **Interceptor** (`background/interceptor.js`): Serves mocks on Fetch events; logs requests from Network events
3. **Rule Engine** (`background/rule-engine.js`): Matches URLs and HTTP methods against rules, highest priority first
4. **Fetch Patterns** (`background/fetch-patterns.js`): Compiles the enabled rules into CDP url patterns
5. **Storage Manager** (`background/storage-manager.js`): Persists rules and groups using the Chrome Storage API

### How It Works

1. The extension attaches Chrome's debugger to the tab you turn on
2. It enables **Network** (to observe) and **Fetch** (to mock)
3. Fetch is pointed only at the URLs your enabled rules could actually match, so unrelated requests are never routed through the debugger. If any enabled rule uses a `regex` match type — which can't be expressed as a CDP url pattern — the tab falls back to pausing everything. With no enabled rules, Fetch is disabled entirely and the tab is purely in record mode.
4. When a request *is* paused, rules are re-evaluated precisely:
   - On a match, the request is **blocked** and a mock response (body, status code, headers) is returned to the page — the real server is never contacted
   - Otherwise it continues untouched
5. Independently, the Network domain records every request on the tab — matched or not — including status, duration, and the response body, so you can turn any of them into a rule

If a rule ever stops firing, **Options → Import/Export → Advanced** has a switch to go back to pausing every request.

### Permissions

- `debugger`: Required to intercept requests and return mock responses
- `storage`: Save rules and settings locally
- `activeTab`: Act on the current tab when you click the extension icon
- `<all_urls>` (host permission): Allow interception on any domain you choose to attach to

## Development

### Project Structure

```
extension-response-intercept/
├── manifest.json                 # Extension configuration
├── background/
│   ├── service-worker.js        # Debugger lifecycle, message routing, badge
│   ├── interceptor.js           # Serves mocks (Fetch); logs requests (Network)
│   ├── fetch-patterns.js        # Compiles enabled rules -> CDP url patterns
│   ├── rule-engine.js           # Rule matching + priority
│   └── storage-manager.js       # Rules, groups, and settings storage
├── shared/                       # Imported by every page and the worker
│   ├── curl.js                  # toCurl (export) + parseCurl (import)
│   ├── rule-suggest.js          # Captured request -> suggested rule
│   ├── url-matching.js          # The wildcard/regex/exact/contains matcher
│   ├── messages.js              # Registry of chrome.runtime message actions
│   └── ...                      # constants, headers, base64, theme, toast, ...
├── popup/
│   ├── popup.html/.js/.css
│   └── modules/                 # rules-view, network, create-rule-modal,
│       │                        #   paste-curl-modal, notifications, ...
│       ├── hint-banner.js       # "why nothing is firing" strip + its fix action
│       └── keyboard.js          # popup-wide shortcuts (/, Esc, Ctrl+Enter)
├── options/
│   ├── options.html/.js/.css
│   └── modules/                 # rule-form, rules-view, groups, import-export,
│                                #   paste-curl, json-editor, ...
├── content/                      # In-page toast when a rule fires
├── icons/
└── README.md
```

The whole extension is plain JavaScript loaded as native ES modules — there is no
bundler and no `package.json`. `shared/` exists so the popup, options page, and
service worker can agree on one implementation of things like URL matching and
cURL parsing rather than drifting apart.

### Building

No build process required - this is a pure JavaScript extension. Simply load it as an unpacked extension in Chrome.

### Debugging

1. Open Chrome DevTools for the extension:
   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker"
2. Console logs will show:
   - Debugger attachment status
   - Intercepted requests
   - Applied rules
   - Any errors

## Limitations

- **Debugger Requirement**: Chrome only allows one debugger per tab, so this extension conflicts with DevTools if they're open on the same tab
- **Mock Only**: Matched requests are fully mocked; the extension does not modify a real (passed-through) server response — to change a response you replace its body with a mock
- **Performance**: Attaching the debugger adds some overhead; attach it only on tabs where you need it

## Tips

- Test rules on a single tab before enabling globally
- Use the browser console to see detailed logs
- Export rules regularly to back up your configuration
- Start with simple wildcard patterns before using regex
- Be specific with URL patterns to avoid unintended matches

## Troubleshooting

**Extension not intercepting requests:**

- Open the popup and read the strip under the toggle — it names the specific
  thing that's blocking you and offers the fix
- Make sure interception is on for the tab (toggle "Intercept this tab" in the popup)
- Check that your rule is enabled, *and* that its group is enabled
- Verify the URL pattern matches the request URL
- Refresh the page after attaching the debugger

**Debugger won't attach:**

- Close Chrome DevTools if open on that tab
- Ensure no other extension is using the debugger
- Try detaching and reattaching

**Rule not applying:**

- Check the browser console for errors
- Verify the URL pattern and match type
- Ensure the modification is valid (valid JSON, regex, etc.)
- Check that the HTTP method matches

## Security Considerations

- This extension can mock any HTTP response on tabs where you attach the debugger
- Only import rule configurations from trusted sources
- The extension requires a powerful permission (debugger access) — review the code before installing

## Support This Project

If you find this extension useful and it's helping you in your development workflow, consider supporting its development and maintenance!

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-yellow?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/MustafaOmran)

Your support helps:

- Keep the extension maintained and up-to-date
- Add new features and improvements
- Fix bugs and address issues
- Provide better documentation and support

**Support via:**

- [Buy Me a Coffee](https://buymeacoffee.com/MustafaOmran) - One-time or recurring support (International)

Every contribution, no matter how small, is greatly appreciated and motivates continued development!

## About the Developer

This extension is created and maintained by **Mustafa Omran**, a passionate software developer dedicated to building tools that enhance developer productivity and streamline workflows.

### Connect with Me

- 🌐 **Portfolio**: [mustafaomran.vercel.app](https://mustafaomran.vercel.app/)
- ☕ **Support**: [Buy Me a Coffee](https://buymeacoffee.com/MustafaOmran)

I'm always open to feedback, suggestions, and collaboration opportunities. If you have ideas for new features or improvements, feel free to reach out!

## License

MIT License - feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Changelog

### Version 2.5.0 (Current)

- **ADDED**: Right-click any page to toggle interception on that tab from the context menu
- **ADDED**: Bulk-mock from the network log — select several captured requests and turn them all into rules at once
- **ADDED**: A guidance strip in the popup that names whatever is stopping rules from firing — tab not intercepted, page not reloaded since the debugger attached, or no rules enabled — each with a one-click fix
- **ADDED**: `Alt+Shift+I` is now bound out of the box (the command existed but shipped unassigned); `/` focuses search, `Esc` closes dialogs, `Ctrl/Cmd+Enter` submits them
- **ADDED**: The intercept card shows which host the per-tab toggle acts on
- **IMPROVED**: Empty states lead with the fastest path (record → **+ Rule**, or **Paste cURL**) instead of only linking to the blank full editor
- **IMPROVED**: "Recently Fired" is hidden until something fires, rather than showing an empty box
- **FIXED**: Clearing **Status Code**, **Delay**, or **Response Headers** on a rule silently kept the old value — the form couldn't distinguish "left empty" from "not supplied", so the shallow merge in `updateRule` could only ever add or change a field, never clear one. Applies to the full editor and both inline status-code editors
- **FIXED**: Detaching the debugger (opening DevTools on an intercepted tab, most often) left the interceptor's per-tab request bookkeeping in memory for the life of the tab
- **FIXED**: A regex rule the engine rejects no longer forces the whole tab to pause *every* request on behalf of a rule that can never match; the rule editor now reports the rejection instead of failing silently in the service-worker console
- **FIXED**: The ReDoS guard rejected ordinary patterns like `/users/(\d+)?/profile`, `[a-z]+?\.js` and `(foo)*bar(baz)+`, while missing `((X+))+` — a group nested one level deeper, and just as catastrophic. It now walks the pattern and pairs each `)` with its own `(` instead of pattern-matching on it, so it catches every repeated group whose body already repeats and leaves the rest alone. `(X+)?` stays allowed: it can match at most once, so it's linear
- **FIXED**: Paste cURL rejected a bare `localhost:3000/api` — the host sniffer required a dot, which ruled out the one host a local dev pastes most. `localhost` and any `host:port` are now accepted; `hello` and `12:30` still aren't
- **FIXED**: Paste cURL left a stray backslash before every embedded quote in bodies and header values from **Copy as cURL (cmd)** — Windows escapes a `"` as `^\^"`, and the parser decoded that one character at a time
- **FIXED**: Clearing the network log wiped every tab's capture instead of the current tab's when the popup couldn't resolve its tab id
- **FIXED**: Importing a pre-2.4 export left legacy `json-path` rules serving `{}` until the next service-worker restart; the migration now runs on import too
- **FIXED**: The network bulk-select bar's buttons rendered at full size — `.btn-small` was never defined in the popup stylesheet
- **FIXED**: One oversized entry could truncate every older entry when mirroring network logs to session storage
- **REMOVED**: Dead group-toggle code in the popup that targeted elements not present in the markup, and the never-invoked debounced rule/group savers whose `onSuspend` flush was a no-op

### Version 2.4.0

- **CHANGED**: Documentation and in-app help now accurately describe the mock-only model — matched requests are blocked and answered with a mock response (the real server is not contacted)
- **REMOVED**: The unsupported JSON-path and regex modify types (they never modified real responses); existing rules using them are migrated to a replace body on upgrade
- **IMPROVED**: Removed dead code from the rule engine and interceptor

### Version 2.0.0

- Response header modification (add, set, remove headers)
- HTTP status code override
- Rule grouping and network logging
- Better error handling and logging

### Version 1.0.0

- Initial release
- Basic response mocking
- Import/export functionality
- User-friendly interface
