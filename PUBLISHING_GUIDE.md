# Chrome Web Store Publishing Guide

Step-by-step guide to publish **API Response Interceptor** to the Chrome Web Store.

---

## Prerequisites

Before you begin, you'll need:
1. A Google account
2. A one-time $5 developer registration fee
3. Screenshots of your extension (see below)
4. A hosted privacy policy URL

---

## Step 1: Create a Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the one-time $5 registration fee
4. Accept the Developer Agreement

---

## Step 2: Host Your Privacy Policy

Your privacy policy needs to be accessible via a public URL. Recommended options:

### Option A: GitHub Pages (Recommended)
1. Push the repository to GitHub (if not already)
2. Go to repo Settings > Pages
3. Enable GitHub Pages from the `main` branch
4. Your privacy policy will be available at:
   ```
   https://muostafa.github.io/ExtensionResponseIntercept/privacy-policy.html
   ```

### Option B: Your Personal Website
Upload `privacy-policy.html` to your website and note the URL.

---

## Step 3: Create Screenshots (Required)

Chrome Web Store requires at least 1 screenshot. We recommend 4 screenshots to showcase all features.

### Screenshot Specifications
- **Size**: 1280x800 or 640x400 pixels (PNG or JPEG)
- **Maximum**: 5 screenshots

### Recommended Screenshots

1. **Main Popup** (`popup-main.png`)
   - Open the extension popup on any webpage
   - Show the rules list with a few example rules
   - Show the Enable/Disable toggle
   - Capture at 1280x800

2. **Rule Creation** (`rule-creation.png`)
   - Open the options page
   - Show the "Add Rule" modal with fields filled
   - Demonstrate URL pattern and modification options
   - Capture at 1280x800

3. **Network Monitor** (`network-monitor.png`)
   - Open the "Network Logs" tab in options
   - Show captured requests with response data
   - Capture at 1280x800

4. **Options Overview** (`options-overview.png`)
   - Show the full options page with rule groups
   - Display import/export functionality
   - Capture at 1280x800

### How to Capture Screenshots

**Windows**: `Win + Shift + S` or Snipping Tool
**Mac**: `Cmd + Shift + 4` or `Cmd + Shift + 5`
**Linux**: `gnome-screenshot` or similar

Save screenshots to: `store-assets/screenshots/`

---

## Step 4: Create Promotional Images (Optional)

These improve your listing visibility but are optional for initial submission.

### Small Promo Tile (440x280)
- Used in Chrome Web Store search results
- Include extension icon and tagline
- Suggested text: "Mock & Modify API Responses"

### Large Promo Tile / Marquee (1400x560)
- Featured on the Chrome Web Store homepage (if selected)
- Include key benefits and branding
- Suggested text: "Test APIs | Mock Responses | Debug Integrations"

Save to: `store-assets/promotional/`

---

## Step 5: Create the Extension Package

Create a ZIP file of the extension (excluding development files):

```bash
cd /home/user/ExtensionResponseIntercept

# Create a clean ZIP for submission
zip -r api-response-interceptor.zip \
  manifest.json \
  background/ \
  popup/ \
  options/ \
  icons/ \
  public/ \
  privacy-policy.html \
  -x "*.DS_Store" \
  -x "__MACOSX/*"
```

Or manually:
1. Select these folders/files: `manifest.json`, `background/`, `popup/`, `options/`, `icons/`, `public/`, `privacy-policy.html`
2. Right-click > Compress/Send to ZIP

---

## Step 6: Submit to Chrome Web Store

1. Go to [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **"New Item"**
3. Upload your ZIP file

### Fill in Store Listing Details

Use the content from `STORE_LISTING.md`:

**Product Details:**
| Field | Value |
|-------|-------|
| Name | API Response Interceptor |
| Description | [Copy from STORE_LISTING.md - Detailed Description section] |
| Category | Developer Tools |
| Language | English |

**Short Description (132 chars max):**
```
Developer tool to intercept and modify API responses in real-time. Test edge cases, mock APIs, and debug integrations easily.
```

**Graphic Assets:**
- Upload your screenshots (from `store-assets/screenshots/`)
- Upload promotional tiles if created (from `store-assets/promotional/`)

**Privacy:**
- Privacy Policy URL: `https://muostafa.github.io/ExtensionResponseIntercept/privacy-policy.html`
- Single Purpose: "This extension provides developers with the ability to intercept and modify HTTP API responses for testing and debugging web applications during development."

### Permission Justifications

When prompted, use these explanations:

| Permission | Justification |
|------------|---------------|
| debugger | Required to intercept network responses using Chrome DevTools Protocol. This is the core mechanism that allows the extension to capture and modify API responses before they reach the web page. |
| storage | Used to persist user-created interception rules and extension preferences locally. No data is synced or transmitted externally. |
| activeTab | Allows the extension to attach the debugger to the currently active tab when the user explicitly clicks the extension icon. This ensures the extension only operates on tabs the user chooses. |
| tabs | Required to track which tabs have an active debugger session and display the correct status in the extension popup. |
| Host Permissions (\<all_urls\>) | Since this is a developer tool meant to test APIs on any website or localhost development server, broad host permissions are required. The extension only intercepts requests on tabs where the user has explicitly attached the debugger. |

---

## Step 7: Submit for Review

1. Review all information for accuracy
2. Click **"Submit for Review"**
3. Wait for Google's review (typically 1-3 business days)

### Review Tips
- The `debugger` permission may trigger additional scrutiny
- Ensure your permission justifications are clear
- The extension has been designed to comply with Chrome policies
- No remote code execution
- No minified code
- Clear, documented purpose

---

## After Approval

Once approved:
1. Your extension will be live on the Chrome Web Store
2. You'll receive an email notification
3. You can share the store URL with users

### Updating the Extension

For future updates:
1. Increment the version in `manifest.json`
2. Create a new ZIP package
3. Upload through the Developer Dashboard
4. Submit for review

---

## Troubleshooting

### "Violation of Chrome Web Store policies"
- Check if all permissions are justified
- Ensure no minified/obfuscated code
- Verify privacy policy is accessible

### "Missing permission justification"
- Provide detailed explanations for each permission
- Explain why broad host permissions are needed for a dev tool

### "Screenshots required"
- Upload at least 1 screenshot (1280x800 or 640x400)
- PNG or JPEG format only

---

## Quick Reference Checklist

- [ ] Developer account created and fee paid
- [ ] Privacy policy hosted online
- [ ] At least 1 screenshot captured (1280x800)
- [ ] ZIP file created with extension files
- [ ] Store listing details filled in
- [ ] Permission justifications provided
- [ ] Submitted for review

---

## Contact

Developer: Mustafa Omran
Website: https://mustafaomran.vercel.app/
GitHub: https://github.com/Muostafa
