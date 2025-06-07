/**
 * Response utilities for consistent API responses
 */
class ResponseUtils {
  /**
   * Parse CloudPanel CLI output to extract useful information
   * @param {string} output - Raw CLI output
   * @returns {Object} - Parsed data
   */
  static parseCliOutput(output) {
    if (!output || typeof output !== 'string') {
      return { raw: output };
    }

    const lines = output.trim().split('\n');
    const result = {
      raw: output,
      lines: lines.filter(line => line.trim() !== '')
    };

    // Try to extract structured data if possible
    try {
      // Look for JSON-like output
      const jsonMatch = output.match(/\{.*\}/s);
      if (jsonMatch) {
        result.parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON, try to extract key-value pairs
      const kvPairs = {};
      lines.forEach(line => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          kvPairs[match[1].trim()] = match[2].trim();
        }
      });
      
      if (Object.keys(kvPairs).length > 0) {
        result.parsed = kvPairs;
      }
    }

    return result;
  }

  /**
   * Format error message from CloudPanel CLI
   * @param {Object} error - Error object
   * @returns {string} - Formatted error message
   */
  static formatError(error) {
    if (typeof error === 'string') {
      return error;
    }

    if (error.stderr && error.stderr.trim()) {
      return error.stderr.trim();
    }

    if (error.error) {
      return error.error;
    }

    if (error.message) {
      return error.message;
    }

    return 'Unknown error occurred';
  }

  /**
   * Sanitize sensitive data from responses
   * @param {Object} data - Response data
   * @returns {Object} - Sanitized data
   */
  static sanitizeResponse(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'credential'];
    const sanitized = JSON.parse(JSON.stringify(data));

    const sanitizeObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }

      if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitizeObject(value);
          }
        }
        return result;
      }

      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Generate API documentation for an endpoint
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {string} description - Endpoint description
   * @param {Object} parameters - Request parameters
   * @returns {Object} - Documentation object
   */
  static generateDocs(method, path, description, parameters = {}) {
    return {
      method: method.toUpperCase(),
      path,
      description,
      parameters,
      example: {
        request: `${method.toUpperCase()} ${path}`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key'
        },
        body: parameters
      }
    };
  }
}

module.exports = ResponseUtils;
