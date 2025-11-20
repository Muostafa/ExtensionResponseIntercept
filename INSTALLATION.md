# Installation Guide

## Quick Start

Follow these simple steps to install and use the API Response Interceptor:

### 1. Load the Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right corner)
4. Click **"Load unpacked"**
5. Select the `ExtensionResponseIntercept` folder
6. The extension icon should appear in your browser toolbar

### 2. First-Time Setup

1. Click the extension icon in your toolbar
2. You'll see the popup with a "Global Interception" toggle
3. Click **"Open Settings"** to create your first rule

### 3. Create Your First Rule

Let's create a simple rule to test the extension:

1. In the Settings page, click **"+ Add New Rule"**
2. Fill in the following:
   - **Rule Name**: "Test API Mock"
   - **URL Pattern**: `*://jsonplaceholder.typicode.com/todos/1`
   - **Match Type**: Wildcard
   - **HTTP Methods**: Keep GET checked
   - **Modification Type**: Replace Entire Body
   - **New Response Body**:
   ```json
   {
     "id": 1,
     "title": "This response was intercepted!",
     "completed": true,
     "userId": 1,
     "intercepted": true
   }
   ```
3. Make sure **"Enable this rule"** is checked
4. Click **"Save Rule"**

### 4. Test the Extension

1. Click the extension icon in your toolbar
2. Click **"Attach Debugger"** to enable interception for the current tab
3. Open a new tab and navigate to: `https://jsonplaceholder.typicode.com/todos/1`
4. You should see your modified response instead of the original!

### 5. View in Browser Console

1. Press F12 to open Chrome DevTools
2. Go to the Console tab
3. You'll see logs showing the interception:
   ```
   Intercepted response: GET https://jsonplaceholder.typicode.com/todos/1 [200]
   ✓ Modified response for https://jsonplaceholder.typicode.com/todos/1
   ```

## Debugging the Extension

### View Extension Logs

1. Go to `chrome://extensions/`
2. Find "API Response Interceptor"
3. Click **"Inspect views: service worker"**
4. A DevTools window will open showing extension console logs

### Common Issues

**Issue: Debugger won't attach**
- Solution: Close DevTools on the tab, then try again
- Only one debugger can be attached per tab

**Issue: Rules not applying**
- Check the URL pattern matches exactly
- Verify the rule is enabled (toggle in popup or settings)
- Make sure the debugger is attached to the tab

**Issue: Extension not loading**
- Verify all files are present (manifest.json, background/, popup/, options/, icons/)
- Check for errors in `chrome://extensions/`

## Examples

### Example 1: Mock API for Development

Replace a real API endpoint with test data:

- **URL Pattern**: `https://api.example.com/users/*`
- **Match Type**: Wildcard
- **Modification**: Replace Body
```json
{
  "users": [
    {"id": 1, "name": "Test User 1"},
    {"id": 2, "name": "Test User 2"}
  ]
}
```

### Example 2: Change Status Flags

Modify a specific field in the JSON response:

- **URL Pattern**: `*/api/feature-flags`
- **Match Type**: Contains
- **Modification**: JSON Path
- **Path**: `features.newUI`
- **Value**: `true`

### Example 3: Transform Response

Use a custom function to modify data:

- **URL Pattern**: `https://api.example.com/.*`
- **Match Type**: Regex
- **Modification**: Function
```javascript
const data = JSON.parse(body);
// Add a timestamp to every response
data.modifiedAt = new Date().toISOString();
return JSON.stringify(data, null, 2);
```

## Advanced Usage

### Auto-attach on Startup

To automatically attach the debugger to tabs:
1. Keep the "Global Interception" toggle enabled
2. The extension will attempt to attach to new tabs automatically

### Import/Export Rules

**Export:**
1. Go to Settings > Import/Export
2. Click "Export All Rules"
3. Save the JSON file

**Import:**
1. Go to Settings > Import/Export
2. Click "Import Rules"
3. Select your JSON file

### Sharing Rules

You can share your exported JSON files with team members. They can import them directly into their extension.

## Performance Tips

1. **Use Specific Patterns**: Instead of `*://*/*`, use more specific patterns like `*://api.example.com/*`
2. **Selective Attachment**: Only attach the debugger to tabs where you need interception
3. **Disable Unused Rules**: Toggle off rules you're not currently using
4. **Remove Old Rules**: Clean up rules you no longer need

## Security Notice

This extension has powerful capabilities:
- It can read and modify all network responses
- Custom JavaScript functions run with extension privileges
- Only use rules from trusted sources
- Be careful when importing rule configurations

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Explore different modification types in the Settings page
- Check the Help tab in Settings for more examples
- Join our community to share rules and tips

## Uninstallation

To remove the extension:
1. Go to `chrome://extensions/`
2. Find "API Response Interceptor"
3. Click **"Remove"**
4. All rules and settings will be deleted

## Getting Help

If you encounter issues:
1. Check the extension service worker logs
2. Review the browser console for errors
3. Verify your rule patterns and modifications
4. Try disabling other extensions that might conflict

## Support

For bugs, feature requests, or questions, please refer to the project repository or documentation.

## About the Developer

This extension is created and maintained by **Mustafa Omran**, a passionate software developer dedicated to building tools that enhance developer productivity and streamline workflows.

**Connect with me:**
- 🌐 Portfolio: [mustafaomran.vercel.app](https://mustafaomran.vercel.app/)
- ☕ Support: [Buy Me a Coffee](https://buymeacoffee.com/MustafaOmran)

Your feedback and suggestions are always welcome!
