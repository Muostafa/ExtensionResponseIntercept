# LinkedIn Demo Video Guide

## Demo: Changing `isAdmin: false` to `isAdmin: true`

This demo shows how API Response Interceptor can modify API responses to bypass frontend access controls - demonstrating why **backend validation is critical**.

---

## Quick Setup (30 seconds)

### 1. Start the demo server
```bash
cd demo
python3 -m http.server 8080
# OR
npx serve .
```

### 2. Open in Chrome
Navigate to: `http://localhost:8080`

### 3. Create the interception rule

**In the extension popup/options, create this rule:**

| Field | Value |
|-------|-------|
| **Rule Name** | Admin Access Demo |
| **URL Pattern** | `*://demo-api.example.com/*` |
| **Match Type** | Wildcard |
| **Modification Type** | JSON Path |
| **JSON Path** | `user.isAdmin` |
| **New Value** | `true` |

### 4. Attach debugger to the tab

---

## Video Script (60-90 seconds)

### Scene 1: The Problem (15 sec)
> "Many web apps check user permissions only on the frontend. Let me show you why that's dangerous."

**Action:** Show the demo page with "Admin Access Required" message visible

### Scene 2: Show the API Response (15 sec)
> "Here's the API response - you can see `isAdmin: false`. The frontend reads this and hides the admin panel."

**Action:** Point to the API Response box showing `"isAdmin": false` in red

### Scene 3: Create the Rule (20 sec)
> "Using API Response Interceptor, I'll create a rule to change this value before it reaches the browser."

**Action:**
1. Open extension popup
2. Show creating a rule with JSON Path modification
3. Set path: `user.isAdmin`, value: `true`

### Scene 4: The Magic (20 sec)
> "Now I'll attach the debugger and refresh the page..."

**Action:**
1. Click "Attach Debugger"
2. Refresh the page
3. Show the response now has `"isAdmin": true` in green
4. Show the Admin Control Panel is now visible!

### Scene 5: The Lesson (15 sec)
> "This is why you should NEVER trust frontend-only access controls. Always validate permissions on your backend."

**Action:** Show the admin panel with all the dangerous buttons

---

## Example Rule JSON (for import)

```json
{
  "rules": [
    {
      "id": "demo-admin-bypass",
      "name": "Admin Access Demo",
      "enabled": true,
      "urlPattern": "*://demo-api.example.com/*",
      "matchType": "wildcard",
      "methods": ["GET", "POST", "PUT", "DELETE", "PATCH"],
      "modifyType": "json-path",
      "modification": {
        "path": "user.isAdmin",
        "value": true
      }
    }
  ]
}
```

---

## Alternative: Replace Entire Response

You can also use "Replace Body" to completely mock the response:

```json
{
  "success": true,
  "user": {
    "id": 12847,
    "name": "John Developer",
    "email": "john@example.com",
    "role": "admin",
    "isAdmin": true,
    "subscription": "enterprise",
    "createdAt": "2024-03-15"
  }
}
```

---

## Key Talking Points

1. **Security Testing** - This tool is great for testing if your app properly validates on the backend
2. **API Mocking** - Perfect for frontend development without waiting for backend
3. **Debugging** - See exactly what responses look like and test edge cases
4. **No Code Changes** - Works with any website, no source code modifications needed

---

## Hashtags for LinkedIn

```
#WebSecurity #FrontendDevelopment #APIDevelopment #CyberSecurity #DevTools #ChromeExtension #SecurityTesting #WebDevelopment #JavaScript #APITesting
```
