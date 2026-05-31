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

### Organization & Workflow

- **Rule Groups**: Organize rules into groups and toggle them together
- **Network Logging**: Inspect requests on the active tab and turn one into a rule ("Create Rule from Network")
- **User-Friendly Interface**: Popup for quick access and a full options page for managing rules
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
2. Turn on "Intercept this tab" to enable interception for the current tab
3. Navigate to the Options page to create rules
4. Create a new rule:
   - Set a URL pattern (e.g., `*://*/api/*`)
   - Choose the match type and HTTP method(s)
   - Enter the mock response body (and optionally status code, headers, delay)
   - Enable the rule
5. Refresh your page to see the mock response

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

The extension uses Chrome's Debugger API (the Fetch domain) to intercept network requests:

1. **Service Worker** (`background/service-worker.js`): Manages debugger attachment and message routing
2. **Interceptor** (`background/interceptor.js`): Handles Fetch events, returns mock responses, and logs requests
3. **Rule Engine** (`background/rule-engine.js`): Matches URLs and HTTP methods against rules
4. **Storage Manager** (`background/storage-manager.js`): Persists rules and groups using the Chrome Storage API

### How It Works

1. The extension attaches Chrome's debugger to the active tab
2. It enables the Fetch domain to intercept network requests
3. When a request is paused at the Request stage:
   - Rules are evaluated against the URL and HTTP method
   - If a match is found, the request is **blocked** and a mock response (body, status code, headers) is returned to the page — the real server is never contacted
   - If no rule matches, the request continues normally
4. Responses to unmatched requests can be captured (when logging is on) so you can turn one into a rule

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
│   ├── service-worker.js        # Main service worker
│   ├── interceptor.js           # Response interception logic
│   ├── rule-engine.js           # Rule matching and modification
│   └── storage-manager.js       # Storage operations
├── popup/
│   ├── popup.html               # Extension popup UI
│   ├── popup.js                 # Popup logic
│   └── popup.css                # Popup styles
├── options/
│   ├── options.html             # Options page UI
│   ├── options.js               # Options page logic
│   └── options.css              # Options page styles
├── icons/                        # Extension icons
└── README.md                     # This file
```

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

- Make sure interception is on for the tab (toggle "Intercept this tab" in the popup)
- Check that your rule is enabled
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

### Version 2.4.0 (Current)

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
