/**
 * Rule Engine - Matches requests against rules and applies modifications
 * @class RuleEngine
 * @description Core engine for matching URLs against defined rules and applying
 * response modifications including body changes, header modifications, and status codes.
 */
export class RuleEngine {
  constructor() {
    /** @type {Array<Object>} Active rules loaded from storage */
    this.rules = [];
    /** @type {Map<string, RegExp>} Pre-compiled regex patterns for performance */
    this.compiledPatterns = new Map();
  }

  /**
   * Set the active rules for the engine
   * @param {Array<Object>} rules - Array of rule objects to load
   */
  setRules(rules) {
    // Validate input is an array
    if (!Array.isArray(rules)) {
      console.error('setRules: rules must be an array, received:', typeof rules);
      this.rules = [];
      return;
    }
    // Filter to only enabled rules with valid structure
    this.rules = rules.filter(rule => rule && typeof rule === 'object' && rule.enabled);
    this.compilePatterns();
    console.log(`Rule engine loaded ${this.rules.length} enabled rules`);
  }

  /**
   * Pre-compile regex patterns for better performance
   * @private
   */
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

  /**
   * Check if a URL matches a pattern based on match type
   * @param {string} url - The URL to test
   * @param {string} pattern - The pattern to match against
   * @param {string} matchType - Type of matching: 'exact', 'wildcard', 'regex', or 'contains'
   * @returns {boolean} True if the URL matches the pattern
   */
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

  /**
   * Match URL against a wildcard pattern
   * @param {string} url - The URL to test
   * @param {string} pattern - Wildcard pattern (* matches non-slash chars, ** matches any)
   * @returns {boolean} True if the URL matches the wildcard pattern
   * @private
   */
  wildcardMatch(url, pattern) {
    // Convert wildcard pattern to regex
    // * matches any characters except /
    // ** matches any characters including /
    try {
      const regexPattern = pattern
        // First, escape all regex special characters except * (which we'll handle specially)
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        // Handle ** (double wildcard) - matches any characters including /
        .replace(/\*\*/g, '<!DOUBLE_WILDCARD!>')
        // Handle * (single wildcard) - matches any characters except /
        .replace(/\*/g, '[^/]*')
        // Restore double wildcard
        .replace(/<!DOUBLE_WILDCARD!>/g, '.*');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url);
    } catch (error) {
      console.error('Invalid wildcard pattern:', error);
      return false;
    }
  }

  /**
   * Find all rules that match a given URL and HTTP method
   * @param {string} url - The request URL
   * @param {string} [method='GET'] - The HTTP method
   * @returns {Array<Object>} Array of matching rules
   */
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

  /**
   * Apply rule modifications to a response
   * @param {string} url - The request URL
   * @param {string} method - The HTTP method
   * @param {string} originalBody - The original response body
   * @param {string} contentType - The response content type
   * @param {Array<Object>} originalHeaders - Original response headers
   * @param {number} originalStatusCode - Original HTTP status code
   * @returns {Promise<Object|null>} Modified response object or null if no modifications
   */
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

  /**
   * Apply header modifications to response headers
   * @param {Array<Object>} originalHeaders - Original headers array
   * @param {Array<Object>} modifications - Header modifications to apply
   * @returns {Array<Object>} Modified headers array
   * @private
   */
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

  /**
   * Apply a body modification based on modification type
   * @param {string} originalBody - The original response body
   * @param {Object} modification - The modification configuration
   * @param {string} modifyType - Type: 'replace', 'json-path', 'regex', or 'function'
   * @param {string} contentType - The content type of the response
   * @returns {Promise<string|null>} Modified body or null if modification fails
   * @private
   */
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
    // Validate inputs
    if (!obj || typeof obj !== 'object') {
      console.error('setNestedProperty: obj must be a valid object');
      return;
    }

    if (!path || typeof path !== 'string') {
      console.error('setNestedProperty: path must be a valid string');
      return;
    }

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // Check if key exists and is not null/undefined
      if (!(key in current) || current[key] === null || current[key] === undefined) {
        current[key] = {};
      }

      // Ensure current[key] is an object before proceeding
      if (typeof current[key] !== 'object') {
        console.warn(`setNestedProperty: Overwriting non-object value at key "${key}"`);
        current[key] = {};
      }

      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
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
}
