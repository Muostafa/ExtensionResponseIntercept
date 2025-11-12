// Rule Engine - Matches requests against rules and applies modifications
export class RuleEngine {
  constructor() {
    this.rules = [];
    this.compiledPatterns = new Map();
  }

  setRules(rules) {
    this.rules = rules.filter(rule => rule.enabled);
    this.compilePatterns();
    console.log(`Rule engine loaded ${this.rules.length} enabled rules`);
  }

  compilePatterns() {
    this.compiledPatterns.clear();
    this.rules.forEach(rule => {
      if (rule.matchType === 'regex') {
        try {
          this.compiledPatterns.set(rule.id, new RegExp(rule.urlPattern));
        } catch (error) {
          console.error(`Failed to compile regex for rule ${rule.id}:`, error);
        }
      }
    });
  }

  matchUrl(url, pattern, matchType) {
    switch (matchType) {
      case 'exact':
        return url === pattern;

      case 'wildcard':
        return this.wildcardMatch(url, pattern);

      case 'regex':
        try {
          const regex = new RegExp(pattern);
          return regex.test(url);
        } catch (error) {
          console.error('Invalid regex pattern:', error);
          return false;
        }

      case 'contains':
        return url.includes(pattern);

      default:
        return false;
    }
  }

  wildcardMatch(url, pattern) {
    // Convert wildcard pattern to regex
    // * matches any characters except /
    // ** matches any characters including /
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<!DOUBLE_WILDCARD!>')
      .replace(/\*/g, '[^/]*')
      .replace(/<!DOUBLE_WILDCARD!>/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  }

  findMatchingRules(url, method = 'GET') {
    const matchingRules = [];

    for (const rule of this.rules) {
      // Check if method matches
      if (rule.methods && rule.methods.length > 0) {
        if (!rule.methods.includes(method)) {
          continue;
        }
      }

      // Check if URL matches
      if (this.matchUrl(url, rule.urlPattern, rule.matchType)) {
        matchingRules.push(rule);
      }
    }

    return matchingRules;
  }

  async modifyResponse(url, method, originalBody, contentType, originalHeaders, originalStatusCode) {
    const matchingRules = this.findMatchingRules(url, method);

    if (matchingRules.length === 0) {
      return null; // No modification needed
    }

    // Apply rules in order (first matching rule wins for now)
    const rule = matchingRules[0];

    console.log(`Applying rule "${rule.name}" to ${url}`);

    try {
      const result = {
        body: originalBody,
        headers: originalHeaders,
        statusCode: originalStatusCode,
        ruleApplied: rule.name,
        ruleId: rule.id
      };

      // Apply body modification if specified
      if (rule.modifyType) {
        const modifiedBody = await this.applyModification(
          originalBody,
          rule.modification,
          rule.modifyType,
          contentType
        );
        if (modifiedBody !== null) {
          result.body = modifiedBody;
        }
      }

      // Apply JSON prettification if specified
      if (rule.prettifyJson) {
        result.body = this.prettifyJsonBody(result.body, contentType);
      }

      // Apply header modifications if specified
      if (rule.modifyHeaders && Array.isArray(rule.modifyHeaders)) {
        result.headers = this.applyHeaderModifications(originalHeaders, rule.modifyHeaders);
      }

      // Apply status code modification if specified
      if (rule.modifyStatusCode !== undefined && rule.modifyStatusCode !== null) {
        result.statusCode = rule.modifyStatusCode;
      }

      return result;
    } catch (error) {
      console.error(`Failed to apply rule "${rule.name}":`, error);
      return null;
    }
  }

  applyHeaderModifications(originalHeaders, modifications) {
    const headersMap = new Map();

    // Convert original headers to map
    if (originalHeaders) {
      originalHeaders.forEach(header => {
        headersMap.set(header.name.toLowerCase(), header.value);
      });
    }

    // Apply modifications
    modifications.forEach(mod => {
      const headerName = mod.name.toLowerCase();

      if (mod.action === 'add' || mod.action === 'set') {
        headersMap.set(headerName, mod.value);
      } else if (mod.action === 'remove') {
        headersMap.delete(headerName);
      }
    });

    // Convert back to array format
    return Array.from(headersMap.entries()).map(([name, value]) => ({
      name,
      value
    }));
  }

  async applyModification(originalBody, modification, modifyType, contentType) {
    switch (modifyType) {
      case 'replace':
        return this.replaceBody(modification);

      case 'json-path':
        return this.modifyJsonPath(originalBody, modification, contentType);

      case 'regex':
        return this.regexReplace(originalBody, modification);

      case 'function':
        return this.executeFunction(originalBody, modification);

      default:
        console.warn(`Unknown modify type: ${modifyType}`);
        return null;
    }
  }

  replaceBody(modification) {
    // Simply replace the entire body
    return modification.value;
  }

  modifyJsonPath(originalBody, modification, contentType) {
    // Parse JSON, modify specific paths, return JSON
    try {
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('Content-Type is not JSON, skipping JSON path modification');
        return null;
      }

      const jsonData = JSON.parse(originalBody);
      const { path, value } = modification;

      // Simple path implementation (supports dot notation)
      this.setNestedProperty(jsonData, path, this.parseValue(value));

      return JSON.stringify(jsonData);
    } catch (error) {
      console.error('Failed to modify JSON:', error);
      return null;
    }
  }

  setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  parseValue(value) {
    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  regexReplace(originalBody, modification) {
    // Apply regex find and replace
    try {
      const { pattern, replacement, flags } = modification;
      const regex = new RegExp(pattern, flags || 'g');
      return originalBody.replace(regex, replacement);
    } catch (error) {
      console.error('Failed to apply regex replacement:', error);
      return null;
    }
  }

  executeFunction(originalBody, modification) {
    // Execute custom JavaScript function
    // WARNING: This is potentially dangerous and should be sandboxed
    try {
      const func = new Function('body', modification.code);
      return func(originalBody);
    } catch (error) {
      console.error('Failed to execute custom function:', error);
      return null;
    }
  }

  prettifyJsonBody(body, contentType) {
    // Prettify JSON body with proper indentation
    try {
      // Only prettify if content type indicates JSON
      if (contentType && !contentType.includes('application/json')) {
        console.log('Content-Type is not JSON, skipping prettification');
        return body;
      }

      // Try to parse and prettify the JSON
      const jsonData = JSON.parse(body);
      return JSON.stringify(jsonData, null, 2);
    } catch (error) {
      console.warn('Failed to prettify JSON (body may not be valid JSON):', error);
      // Return original body if parsing fails
      return body;
    }
  }
}
