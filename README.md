# API Response Interceptor

A Chrome extension that enables you to intercept and modify API response bodies in real-time, similar to Requestly's functionality.

## Features

### Core Interception
- **Real-time Response Interception**: Intercept HTTP responses before they reach your application
- **Multiple Modification Types**:
  - Replace entire response body
  - Modify specific JSON paths
  - Regex find and replace
  - Custom JavaScript functions
- **Flexible URL Matching**: Support for wildcards, regex, exact matches, and contains patterns
- **HTTP Method Filtering**: Target specific methods (GET, POST, PUT, DELETE, PATCH)

### Advanced Modifications
- **Response Header Modification**: Add, modify, or remove response headers (e.g., CORS headers)
- **Status Code Modification**: Change HTTP status codes (e.g., turn 404s into 200s)
- **Multi-layer Modifications**: Combine body, header, and status code changes in a single rule

### User Experience
- **User-Friendly Interface**: Intuitive popup and options page for managing rules
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
2. Click "Attach Debugger" to enable interception for the current tab
3. Navigate to the Options page to create rules
4. Create a new rule:
   - Set a URL pattern (e.g., `*://*/api/*`)
   - Choose modification type
   - Define your modification
   - Enable the rule
5. Refresh your page to see the modifications

### Creating Rules

#### URL Patterns

- **Wildcard**: `*://*/api/*` - Matches all API endpoints
- **Regex**: `https://api\.example\.com/v1/.*` - Use regex for complex patterns
- **Exact**: `https://example.com/api/users` - Match exact URLs
- **Contains**: `/api/data` - Match URLs containing this string

#### Modification Types

**1. Replace Entire Body**
```json
{
  "status": "success",
  "data": "Modified response"
}
```

**2. Modify JSON Path**
- Path: `data.status`
- Value: `"modified"`

**3. Regex Find & Replace**
- Pattern: `"error"`
- Replacement: `"success"`
- Flags: `g` (global)

**4. Custom JavaScript Function**
```javascript
// The 'body' parameter contains the original response
const data = JSON.parse(body);
data.modified = true;
return JSON.stringify(data);
```

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

**Example 1: Mock API Response**
- URL Pattern: `*://jsonplaceholder.typicode.com/todos/*`
- Match Type: Wildcard
- Modification: Replace Body
```json
{
  "id": 1,
  "title": "Mocked Todo",
  "completed": true,
  "userId": 1
}
```

**Example 2: Change Status Field**
- URL Pattern: `*/api/status`
- Match Type: Contains
- Modification: JSON Path
- Path: `status`
- Value: `"online"`

**Example 3: Transform Response**
- URL Pattern: `https://api.example.com/.*`
- Match Type: Regex
- Modification: Function
```javascript
const data = JSON.parse(body);
data.intercepted = true;
data.timestamp = Date.now();
return JSON.stringify(data, null, 2);
```

**Example 4: CORS Bypass with Headers**
- URL Pattern: `*://external-api.com/*`
- Match Type: Wildcard
- Status Code: Keep original
- Headers:
  - Set `Access-Control-Allow-Origin` = `*`
  - Set `Access-Control-Allow-Methods` = `GET, POST, PUT, DELETE`
  - Set `Access-Control-Allow-Headers` = `*`

**Example 5: Convert Error to Success**
- URL Pattern: `*/api/flaky-endpoint`
- Match Type: Contains
- Status Code: 200
- Modification: Replace Body
```json
{
  "success": true,
  "message": "Request succeeded"
}
```

## Technical Details

### Architecture

The extension uses Chrome's Debugger API to intercept network responses:

1. **Service Worker** (`background/service-worker.js`): Manages debugger attachment and rule execution
2. **Interceptor** (`background/interceptor.js`): Handles Fetch API events and response modification
3. **Rule Engine** (`background/rule-engine.js`): Matches URLs and applies modifications
4. **Storage Manager** (`background/storage-manager.js`): Persists rules using Chrome Storage API

### How It Works

1. The extension attaches Chrome's debugger to the active tab
2. It enables the Fetch domain to intercept network requests
3. When a request is paused at the Response stage:
   - The original response body is retrieved
   - Rules are evaluated against the URL
   - If a match is found, the modification is applied
   - The modified response is returned to the page

### Permissions

- `debugger`: Required to intercept and modify responses
- `storage`: Save rules and settings
- `tabs`: Access tab information
- `activeTab`: Interact with the active tab
- `webRequest`: Monitor network requests
- `<all_urls>`: Intercept requests to any domain

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

- **Debugger Requirement**: Chrome only allows one debugger per tab, so this extension conflicts with DevTools if they're open
- **CORS**: The extension doesn't bypass CORS; it modifies responses after they've been received
- **Performance**: Attaching the debugger adds some overhead; use selectively on tabs where needed
- **Security**: Custom JavaScript functions execute with extension privileges - use caution

## Tips

- Test rules on a single tab before enabling globally
- Use the browser console to see detailed logs
- Export rules regularly to back up your configuration
- Start with simple wildcard patterns before using regex
- Be specific with URL patterns to avoid unintended matches

## Troubleshooting

**Extension not intercepting requests:**
- Make sure the debugger is attached (click "Attach Debugger" in popup)
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

- This extension can modify any HTTP response on pages where it's enabled
- Custom JavaScript functions can execute arbitrary code
- Only install rules from trusted sources
- Be cautious when importing rule configurations
- The extension requires powerful permissions - review the code before installing

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
- [InstaPay](https://ipn.eg/S/mustafaomran2000/instapay/0MTHXn) - For supporters in Egypt (QR code also available in the extension's Help section)

Every contribution, no matter how small, is greatly appreciated and motivates continued development!

## License

MIT License - feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Changelog

### Version 2.0.0 (Current)
- **NEW**: Response header modification (add, set, remove headers)
- **NEW**: HTTP status code modification
- **IMPROVED**: Rule engine now supports multi-layer modifications
- **IMPROVED**: Better error handling and logging
- **IMPROVED**: Enhanced UI

### Version 1.0.0
- Initial release
- Basic response interception and modification
- Support for replace, JSON path, regex, and function modifications
- Import/export functionality
- User-friendly interface
