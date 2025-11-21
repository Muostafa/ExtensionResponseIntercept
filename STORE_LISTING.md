# Chrome Web Store Listing

Use this content when submitting to the Chrome Web Store.

---

## Extension Name
API Response Interceptor

## Short Description (132 characters max)
Developer tool to intercept and modify API responses in real-time. Test edge cases, mock APIs, and debug integrations easily.

## Detailed Description

**API Response Interceptor** is a powerful developer tool that helps web developers test, debug, and mock API responses without modifying backend code.

### Key Features

**Response Modification**
- Replace entire response bodies with custom JSON
- Modify specific JSON fields using path notation
- Use regex find & replace for text transformations
- Write custom JavaScript functions for complex transformations

**Header Management**
- Add, modify, or remove response headers
- Test CORS configurations
- Simulate different server behaviors

**Status Code Control**
- Override HTTP status codes
- Test error handling in your applications
- Simulate server errors for edge case testing

**Developer-Friendly**
- Intuitive rule-based system with groups for organization
- URL pattern matching with wildcards and regex support
- Import/Export rules for team sharing
- Real-time network request monitoring

### Use Cases

1. **API Mocking** - Mock API responses during frontend development before the backend is ready
2. **Error Testing** - Simulate error responses to test error handling
3. **Edge Case Testing** - Test how your app handles unusual response data
4. **Demo Preparation** - Prepare consistent demo data for presentations
5. **Legacy System Testing** - Test integrations with systems you can't modify

### How It Works

1. Create rules with URL patterns to match specific API endpoints
2. Define how responses should be modified
3. Attach the debugger to a tab
4. Browse normally - matching responses are automatically modified

### Privacy & Security

- All data is stored locally on your device
- No external servers or analytics
- No data collection whatsoever
- Open source and transparent

---

## Category
Developer Tools

## Language
English

---

## Single Purpose Description (Required by Chrome)

This extension provides developers with the ability to intercept and modify HTTP API responses for testing and debugging web applications during development.

---

## Permissions Justification

### debugger
Required to intercept network responses using Chrome DevTools Protocol. This is the core mechanism that allows the extension to capture and modify API responses before they reach the web page.

### storage
Used to persist user-created interception rules and extension preferences locally. No data is synced or transmitted externally.

### activeTab
Allows the extension to attach the debugger to the currently active tab when the user explicitly clicks the extension icon. This ensures the extension only operates on tabs the user chooses.

### tabs
Required to track which tabs have an active debugger session and display the correct status in the extension popup.

### webRequest
Enables monitoring of network requests to identify which ones match user-defined interception rules.

### Host Permissions (<all_urls>)
Since this is a developer tool meant to test APIs on any website or localhost development server, broad host permissions are required. The extension only intercepts requests on tabs where the user has explicitly attached the debugger.

---

## Privacy Policy URL
Link to the privacy-policy.html hosted on your website or GitHub Pages.

Example: https://muostafa.github.io/ExtensionResponseIntercept/privacy-policy.html

---

## Screenshots Recommendations

1. **Main Popup** - Show the extension popup with active rules
2. **Rule Editor** - Show the options page rule creation form
3. **Network Monitor** - Show the network request capture feature
4. **Before/After** - Show a modified API response in DevTools

---

## Promotional Images

**Small Tile (440x280)**
- Show extension icon with tagline "Mock & Modify API Responses"

**Marquee (1400x560)**
- Feature key benefits: "Test APIs | Mock Responses | Debug Integrations"
