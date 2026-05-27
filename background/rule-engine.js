/**
 * Rule Engine - Matches requests against rules and applies modifications
 *
 * This module is responsible for:
 * - Storing and managing interception rules
 * - Matching URLs against rule patterns (exact, wildcard, regex, contains)
 * - Applying response modifications (replace, json-path, regex)
 * - Managing HTTP header modifications
 *
 * @module RuleEngine
 */

/**
 * @typedef {Object} Rule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Human-readable rule name
 * @property {string} urlPattern - URL pattern to match against
 * @property {('exact'|'wildcard'|'regex'|'contains')} matchType - Type of URL matching
 * @property {string[]} [methods] - HTTP methods to match (GET, POST, etc.)
 * @property {boolean} enabled - Whether the rule is active
 * @property {('replace'|'json-path'|'regex')} [modifyType] - Type of body modification
 * @property {Object} [modification] - Modification configuration
 * @property {HeaderModification[]} [modifyHeaders] - Header modifications
 * @property {number} [modifyStatusCode] - Override status code
 * @property {number} [delay] - Response delay in milliseconds
 */

/**
 * @typedef {Object} HeaderModification
 * @property {string} name - Header name
 * @property {string} value - Header value
 * @property {('add'|'set'|'remove')} action - Modification action
 */

/**
 * @typedef {Object} ModificationResult
 * @property {string} body - Modified response body
 * @property {Object[]} headers - Modified headers array
 * @property {number} statusCode - Response status code
 * @property {string} ruleApplied - Name of the applied rule
 * @property {string} ruleId - ID of the applied rule
 */

import { isBinaryContentType } from '../shared/content-types.js';
import { safeCompileRegex } from '../shared/regex.js';
import { applyHeaderModifications } from '../shared/headers.js';
import { compileWildcard } from '../shared/url-matching.js';
import { debug } from '../shared/debug.js';

export class RuleEngine {
  constructor() {
    /** @type {Rule[]} */
    this.rules = [];
    /** @type {Map<string, RegExp>} Pre-compiled regex patterns for performance */
    this.compiledPatterns = new Map();
  }

  /**
   * Load rules into the engine
   * @param {Rule[]} rules - Array of rules to load
   */
  setRules(rules) {
    // Validate input is an array
    if (!Array.isArray(rules)) {
      debug.error('setRules: rules must be an array, received:', typeof rules);
      this.rules = [];
      return;
    }
    // Filter to only enabled rules with valid structure
    this.rules = rules.filter(rule => rule && typeof rule === 'object' && rule.enabled);
    this.compilePatterns();
    debug.log(`Rule engine loaded ${this.rules.length} enabled rules`);
  }

  /**
   * Pre-compile regex patterns for better performance
   * @private
   */
  compilePatterns() {
    this.compiledPatterns.clear();
    this.rules.forEach(rule => {
      if (rule.matchType === 'regex') {
        const compiled = safeCompileRegex(rule.urlPattern);
        if (compiled) {
          this.compiledPatterns.set(rule.id, compiled);
        } else {
          debug.error(`Skipping unsafe/invalid regex for rule ${rule.id}`);
        }
      } else if (rule.matchType === 'wildcard') {
        const compiled = compileWildcard(rule.urlPattern);
        if (compiled) this.compiledPatterns.set(rule.id, compiled);
      }
    });
  }

  /**
   * Check if a URL matches a given pattern
   * @param {string} url - The URL to test
   * @param {string} pattern - The pattern to match against
   * @param {('exact'|'wildcard'|'regex'|'contains')} matchType - Type of matching
   * @returns {boolean} Whether the URL matches
   */
  matchUrl(url, pattern, matchType) {
    switch (matchType) {
      case 'exact':
        return url === pattern;

      case 'wildcard': {
        const compiled = compileWildcard(pattern);
        return compiled ? compiled.test(url) : false;
      }

      case 'regex': {
        const regex = safeCompileRegex(pattern);
        return regex ? regex.test(url) : false;
      }

      case 'contains':
        return url.includes(pattern);

      default:
        return false;
    }
  }

  /**
   * Match URL against a rule using pre-compiled patterns where available
   * @param {string} url - The URL to test
   * @param {Rule} rule - The rule to match against
   * @returns {boolean} Whether the URL matches
   * @private
   */
  matchUrlForRule(url, rule) {
    const compiled = this.compiledPatterns.get(rule.id);
    if (compiled) {
      return compiled.test(url);
    }
    // Fallback for exact/contains (no pre-compilation needed)
    return this.matchUrl(url, rule.urlPattern, rule.matchType);
  }

  /**
   * Find all rules that match a given URL and HTTP method
   * @param {string} url - The request URL
   * @param {string} [method='GET'] - The HTTP method
   * @returns {Rule[]} Array of matching rules (first match has highest priority)
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
      if (this.matchUrlForRule(url, rule)) {
        matchingRules.push(rule);
      }
    }

    return matchingRules;
  }

  /**
   * Modify a response based on matching rules
   * @param {string} url - The request URL
   * @param {string} method - The HTTP method
   * @param {string} originalBody - The original response body
   * @param {string} contentType - The Content-Type header value
   * @param {Object[]} originalHeaders - Original response headers
   * @param {number} originalStatusCode - Original HTTP status code
   * @returns {Promise<ModificationResult|null>} Modified response or null if no modification
   */
  async modifyResponse(url, method, originalBody, contentType, originalHeaders, originalStatusCode) {
    const matchingRules = this.findMatchingRules(url, method);

    if (matchingRules.length === 0) {
      return null; // No modification needed
    }

    // Apply rules in order (first matching rule wins for now)
    const rule = matchingRules[0];

    debug.log(`Applying rule "${rule.name}" to ${url}`);

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
        result.headers = applyHeaderModifications(originalHeaders, rule.modifyHeaders);
      }

      // Apply status code modification if specified
      if (rule.modifyStatusCode !== undefined && rule.modifyStatusCode !== null) {
        result.statusCode = rule.modifyStatusCode;
      }

      return result;
    } catch (error) {
      debug.error(`Failed to apply rule "${rule.name}":`, error);
      return null;
    }
  }

  /**
   * Apply a body modification based on the modification type
   * @param {string} originalBody - Original response body
   * @param {Object} modification - Modification configuration
   * @param {('replace'|'json-path'|'regex')} modifyType - Type of modification
   * @param {string} contentType - Response Content-Type
   * @returns {Promise<string|null>} Modified body or null on failure
   * @private
   */
  async applyModification(originalBody, modification, modifyType, contentType) {
    if (isBinaryContentType(contentType) && (modifyType === 'json-path' || modifyType === 'regex')) {
      debug.warn(`modifyType '${modifyType}' is not compatible with binary content type '${contentType}'`);
      return null;
    }

    switch (modifyType) {
      case 'replace':
        return this.replaceBody(modification);

      case 'json-path':
        return this.modifyJsonPath(originalBody, modification, contentType);

      case 'regex':
        return this.regexReplace(originalBody, modification);

      default:
        debug.warn(`Unknown modify type: ${modifyType}`);
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
        debug.warn('Content-Type is not JSON, skipping JSON path modification');
        return null;
      }

      const jsonData = JSON.parse(originalBody);
      const { path, value } = modification;

      // Simple path implementation (supports dot notation)
      this.setNestedProperty(jsonData, path, this.parseValue(value));

      return JSON.stringify(jsonData);
    } catch (error) {
      debug.error('Failed to modify JSON:', error);
      return null;
    }
  }

  setNestedProperty(obj, path, value) {
    // Validate inputs
    if (!obj || typeof obj !== 'object') {
      debug.error('setNestedProperty: obj must be a valid object');
      return;
    }

    if (!path || typeof path !== 'string') {
      debug.error('setNestedProperty: path must be a valid string');
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
        debug.warn(`setNestedProperty: Overwriting non-object value at key "${key}"`);
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
      const regex = safeCompileRegex(pattern, flags || 'g');
      if (!regex) return null;
      return originalBody.replace(regex, replacement);
    } catch (error) {
      debug.error('Failed to apply regex replacement:', error);
      return null;
    }
  }
}
