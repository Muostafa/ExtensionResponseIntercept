# API Response Interceptor - Video Demo Script

## Video Overview
**Duration**: ~5-7 minutes
**Target Audience**: Web developers, QA engineers, API testers
**Goal**: Show how to intercept and modify API responses in real-time

---

## Scene 1: Introduction (30 seconds)

### Narration
> "Have you ever needed to test how your app handles error responses, mock an API that isn't ready yet, or debug a tricky API issue? Today I'll show you API Response Interceptor - a Chrome extension that lets you intercept and modify any API response in real-time, without touching your server code."

### On Screen
- Show the extension icon in Chrome toolbar
- Quick flash of the popup interface

---

## Scene 2: Getting Started (45 seconds)

### Actions
1. **Open a demo website** (use any site with API calls, like JSONPlaceholder or your own app)
2. **Click the extension icon** to open the popup
3. **Click "Attach Debugger"** button
4. **Show the status change** - "Intercepting" badge appears

### Narration
> "First, navigate to the website you want to test. Click the extension icon, then click 'Attach Debugger'. This connects the extension to your current tab and starts monitoring network requests. You'll see the status change to 'Intercepting'."

### Tips to Show
- The debugger is tab-specific
- A yellow warning bar may appear (this is normal for Chrome Debugger)

---

## Scene 3: Creating Your First Rule (90 seconds)

### Actions
1. **Click "New Rule"** or go to Options page
2. **Fill in the form**:
   - **Name**: "Mock User API"
   - **Description**: "Return custom user data"
   - **URL Pattern**: `*/api/users/*` (wildcard)
   - **Match Type**: Wildcard
   - **HTTP Method**: GET
   - **Modification Type**: Replace Body
   - **New Response Body**:
     ```json
     {
       "id": 1,
       "name": "Demo User",
       "email": "demo@example.com",
       "role": "admin"
     }
     ```
3. **Save the rule**
4. **Enable the rule** (toggle switch)

### Narration
> "Let's create our first rule. Click 'New Rule' and give it a name. For the URL pattern, I'll use a wildcard to match any user API endpoint. I want to replace the entire response body with my custom JSON. This is perfect for mocking APIs during development."

---

## Scene 4: See It In Action (60 seconds)

### Actions
1. **Open DevTools** (F12) → Network tab
2. **Trigger the API call** (refresh page or click a button)
3. **Show the network request** being intercepted
4. **Show the modified response** in DevTools
5. **Show the UI reflecting the mocked data**

### Narration
> "Now watch the magic happen. I'll open DevTools to see the network requests. When I refresh the page, you can see the API call is made, but look at the response - it's our custom data! The application now displays our mocked user instead of the real one."

---

## Scene 5: Modify Specific Fields with JSON Path (60 seconds)

### Actions
1. **Create a new rule** with "Modify JSON Path" type
2. **Settings**:
   - **URL Pattern**: `*/api/posts*`
   - **Modification Type**: Modify JSON Path
   - **JSON Path**: `data.0.title`
   - **New Value**: `"This title was modified by the extension!"`
3. **Trigger the API** and show only that field changed

### Narration
> "Sometimes you don't want to replace the entire response - just one field. Use 'Modify JSON Path' and specify the path using dot notation. Here I'm changing just the title of the first post. Everything else stays the same, but that one field gets our custom value."

---

## Scene 6: Test Error Scenarios (45 seconds)

### Actions
1. **Create an error-testing rule**:
   - **Status Code Override**: 500
   - **Response Body**: `{"error": "Internal Server Error", "message": "Database connection failed"}`
2. **Show the app receiving a 500 error**
3. **Show error handling UI** in the application

### Narration
> "One of the most powerful features is testing error scenarios. What happens when your API returns a 500 error? Set the status code override to 500 and provide an error response. Now you can test your error handling without breaking anything on the server."

---

## Scene 7: Network Logging (45 seconds)

### Actions
1. **Click the "Network" tab** in the popup
2. **Show captured requests** with timestamps
3. **Click on a request** to see details
4. **Click "Create Rule"** button on a logged request
5. **Show the rule form auto-populated** with URL and method

### Narration
> "The Network tab captures all API requests made by the page. This is great for debugging. Even better - see a request you want to intercept? Just click 'Create Rule' and the extension auto-fills the URL pattern and method. Super convenient!"

---

## Scene 8: Rule Groups & Organization (30 seconds)

### Actions
1. **Go to Options page** → Rules & Groups
2. **Create a new group**: "Development Mocks"
3. **Drag rules into the group**
4. **Toggle the entire group** on/off

### Narration
> "As you create more rules, organize them into groups. Maybe one group for development mocks, another for testing errors. You can enable or disable entire groups with one click - perfect for switching between test scenarios."

---

## Scene 9: Import/Export Rules (30 seconds)

### Actions
1. **Go to Import/Export tab**
2. **Click "Export All Rules"**
3. **Show the downloaded JSON file**
4. **Show importing** on a different browser/profile

### Narration
> "Share your rules with your team using import and export. Export creates a JSON file with all your rules and groups. Your teammates can import it and have the exact same test setup. Great for consistent testing across the team."

---

## Scene 10: Bonus Features (30 seconds)

### Quick Demo of:
1. **Header modification** - Add custom headers or modify CORS
2. **Regex find & replace** - Pattern-based modifications
3. **Dark/Light theme** toggle
4. **Search functionality** - Find rules quickly

### Narration
> "There's more to explore - modify response headers for CORS testing, use regex for complex replacements, and search through your rules. The extension also supports dark mode for those late-night debugging sessions."

---

## Scene 11: Wrap Up (30 seconds)

### On Screen
- Show the extension popup one more time
- Display key benefits as bullet points

### Narration
> "That's API Response Interceptor - your tool for mocking, testing, and debugging APIs right in the browser. No server changes needed, no proxy setup, just install and start intercepting. Available now on the Chrome Web Store."

### Call to Action
- Link to Chrome Web Store
- Link to GitHub for issues/feedback

---

## Demo Websites to Use

For a convincing demo, use one of these:

1. **JSONPlaceholder** (https://jsonplaceholder.typicode.com)
   - Free fake API
   - Endpoints: `/users`, `/posts`, `/comments`

2. **ReqRes** (https://reqres.in)
   - Another free fake API
   - Good for testing user data

3. **Your own test page** - Create a simple HTML page:

```html
<!DOCTYPE html>
<html>
<head>
    <title>API Interceptor Demo</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        #result { background: #f5f5f5; padding: 15px; margin-top: 20px; border-radius: 8px; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>API Response Interceptor Demo</h1>
    <button onclick="fetchUser()">Fetch User Data</button>
    <button onclick="fetchPosts()">Fetch Posts</button>
    <div id="result">Click a button to fetch data...</div>

    <script>
        async function fetchUser() {
            const res = await fetch('https://jsonplaceholder.typicode.com/users/1');
            const data = await res.json();
            document.getElementById('result').innerHTML =
                `<h3>User Data:</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
        }

        async function fetchPosts() {
            const res = await fetch('https://jsonplaceholder.typicode.com/posts?userId=1');
            const data = await res.json();
            document.getElementById('result').innerHTML =
                `<h3>Posts (${data.length}):</h3><pre>${JSON.stringify(data.slice(0,2), null, 2)}</pre>`;
        }
    </script>
</body>
</html>
```

---

## Recording Tips

1. **Screen Resolution**: 1920x1080 or 1280x720
2. **Browser Zoom**: 110-125% for better visibility
3. **Clean Browser**: Use a fresh Chrome profile with minimal extensions
4. **DevTools Position**: Dock to bottom for better screen space
5. **Cursor Highlighter**: Use a tool to highlight mouse clicks
6. **Pre-create Rules**: Have some rules ready to show quickly

---

## Sample Rules for Demo

### Rule 1: Mock User Data
```json
{
  "name": "Mock User API",
  "urlPattern": "*://jsonplaceholder.typicode.com/users/*",
  "matchType": "wildcard",
  "method": "GET",
  "modificationType": "replaceBody",
  "responseBody": "{\"id\":1,\"name\":\"Demo User\",\"email\":\"demo@test.com\",\"company\":{\"name\":\"Test Corp\"}}",
  "enabled": true
}
```

### Rule 2: Simulate Error
```json
{
  "name": "Simulate Server Error",
  "urlPattern": "*://*/api/error-test*",
  "matchType": "wildcard",
  "method": "GET",
  "modificationType": "replaceBody",
  "statusCode": 500,
  "responseBody": "{\"error\":\"Internal Server Error\",\"message\":\"Database connection failed\"}",
  "enabled": true
}
```

### Rule 3: Modify Single Field
```json
{
  "name": "Change Post Title",
  "urlPattern": "*://jsonplaceholder.typicode.com/posts*",
  "matchType": "wildcard",
  "method": "GET",
  "modificationType": "modifyJsonPath",
  "jsonPath": "0.title",
  "newValue": "This title was intercepted!",
  "enabled": true
}
```

---

## Thumbnail Ideas

1. Browser with API response being "intercepted" mid-air
2. Split screen: Original response vs Modified response
3. Extension popup with arrows showing the flow
4. "Before/After" comparison of API data

---

## Video Title Suggestions

1. "Intercept & Modify Any API Response in Chrome - No Code Changes!"
2. "API Response Interceptor: Mock APIs Like a Pro"
3. "Test API Error Handling Without Breaking Your Server"
4. "The Ultimate Chrome Extension for API Testing & Debugging"
