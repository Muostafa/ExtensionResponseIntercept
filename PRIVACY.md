# Privacy Policy for API Response Interceptor

**Last Updated:** November 2024

## Overview

API Response Interceptor is a Chrome extension designed to help developers intercept and modify API responses for testing and debugging purposes. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection

### What We DO NOT Collect

- **No Personal Information**: We do not collect, store, or transmit any personal information.
- **No Browsing History**: We do not track or store your browsing history.
- **No Analytics**: We do not use any analytics or tracking services.
- **No External Servers**: We do not send any data to external servers.
- **No User Accounts**: We do not require or support user accounts.

### What We DO Store Locally

The extension stores the following data **locally on your device only** using Chrome's built-in storage API:

1. **Rules Configuration**: Your custom interception rules, including:
   - Rule names and descriptions
   - URL patterns
   - Modification settings (response body, headers, status codes)
   - Group assignments

2. **Groups Configuration**: Rule group settings including:
   - Group names and descriptions
   - Color preferences
   - Enabled/disabled states

3. **Extension Settings**: Your preferences such as:
   - Global enabled/disabled state
   - Theme preference (light/dark mode)

**Important**: All data is stored locally using `chrome.storage.local` and never leaves your device.

## Permissions Explained

The extension requires the following permissions:

### `debugger`
- **Why**: Required to intercept and modify network responses using Chrome's Debugger API.
- **Scope**: Only active when you explicitly attach the debugger to a tab.
- **Data Access**: Allows the extension to intercept network requests for matching URLs only.

### `storage`
- **Why**: Required to save your rules, groups, and settings locally.
- **Scope**: Data is stored only on your local device.

### `tabs`
- **Why**: Required to know which tab to attach the debugger to.
- **Scope**: Only accesses tab IDs, not tab content or browsing history.

### `activeTab`
- **Why**: Required to interact with the currently active tab when you click the extension icon.
- **Scope**: Only active tab, only when you interact with the extension.

### `webRequest`
- **Why**: Required to monitor network requests for interception.
- **Scope**: Only monitors requests that match your defined rules.

### `<all_urls>` (Host Permissions)
- **Why**: Required to allow interception rules to work on any website you choose.
- **Scope**: Only processes URLs that match your defined rule patterns.

## Data Security

- All data is stored locally on your device using Chrome's secure storage API.
- No data is transmitted over the network.
- No encryption keys or credentials are stored or transmitted.
- The extension does not have access to data from other extensions.

## Import/Export Feature

When you use the Import/Export feature:
- **Export**: Creates a JSON file downloaded to your device containing your rules and groups.
- **Import**: Reads a JSON file from your device to add rules and groups.
- No data is sent to any external server during import or export.

## Custom JavaScript Functions

The extension allows you to write custom JavaScript functions to modify responses. Please note:
- These functions execute locally within the extension context.
- Only import functions from trusted sources.
- The extension does not validate or sanitize custom function code.

## Third-Party Services

This extension does not integrate with any third-party services, analytics platforms, or external APIs. The only external links are optional support links (Buy Me a Coffee, InstaPay) that open in a new tab if you choose to support the developer.

## Children's Privacy

This extension is designed for developer use and does not knowingly collect information from children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this document. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Open Source

This extension is open source. You can review the complete source code to verify our privacy claims.

## Contact

If you have questions about this privacy policy or the extension's data practices, you can:
- Open an issue on the GitHub repository
- Contact the developer at [mustafaomran.vercel.app](https://mustafaomran.vercel.app/)

## Summary

**Your privacy is protected because:**
1. All data stays on your device
2. No external network requests are made
3. No analytics or tracking is used
4. No personal information is collected
5. The source code is open for review

---

*API Response Interceptor is created and maintained by Mustafa Omran.*
