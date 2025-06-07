# CloudPanel API - Confirmation Handler Fix

## Overview

Fixed the CloudPanel API to properly handle CLI commands that require confirmation prompts, specifically the `site:delete`, `user:delete`, and `vhost-template:delete` commands.

## Problem

The original implementation would hang when executing deletion commands because:
1. CloudPanel CLI commands like `site:delete` require user confirmation by typing "yes"
2. In a non-interactive API environment, these prompts would cause the command to timeout
3. The API didn't utilize the `--force` parameter or provide automated confirmation input

## Solution

### 1. Enhanced Command Execution

Updated the `executeCommand` method in `CloudPanelService` to support:
- **Input handling**: Ability to provide automated input for interactive commands
- **Flexible options**: Additional execution options for different command types

```javascript
async executeCommand(command, args = [], options = {}) {
  // Enhanced to support input for interactive commands
  if (options.input) {
    childProcess.stdin.write(options.input);
    childProcess.stdin.end();
  }
}
```

### 2. Smart Deletion Methods

Updated all deletion methods to handle confirmations intelligently:

#### Site Deletion
- **Default behavior**: Uses `--force` flag to skip confirmation (recommended for API usage)
- **Optional confirmation**: Can provide "yes" input if force is disabled

```javascript
async deleteSite(domainName, force = true) {
  if (force) {
    args.push('--force');  // Skip confirmation entirely
  } else {
    // Provide "yes" input for confirmation
    return this.executeCommand('site:delete', args, { input: 'yes\n' });
  }
}
```

#### User Deletion
- **Auto-confirmation**: Automatically provides "yes" input since user deletion doesn't support `--force`

```javascript
async deleteUser(userName, force = true) {
  // Always provide confirmation input
  return this.executeCommand('user:delete', args, { input: 'yes\n' });
}
```

#### VHost Template Deletion
- **Auto-confirmation**: Automatically provides "yes" input for consistent API behavior

```javascript
async deleteVhostTemplate(name, force = true) {
  // Always provide confirmation input
  return this.executeCommand('vhost-template:delete', args, { input: 'yes\n' });
}
```

### 3. Updated API Endpoints

Enhanced validation schemas and route handlers to support the new `force` parameter:

#### Site Deletion
```bash
DELETE /api/site/delete
{
  "domainName": "example.com",
  "force": true  // Optional, defaults to true
}
```

#### User Deletion
```bash
DELETE /api/user/delete
{
  "userName": "john.doe",
  "force": true  // Optional, defaults to true
}
```

#### VHost Template Deletion
```bash
DELETE /api/vhost-templates/delete
{
  "name": "My Template",
  "force": true  // Optional, defaults to true
}
```

## Benefits

1. **No More Hanging**: Commands no longer hang waiting for user input
2. **Consistent API Behavior**: All deletion endpoints work reliably in automated environments
3. **Flexible Control**: Option to use force mode or confirmation mode based on requirements
4. **Better Error Handling**: Proper error reporting when commands fail
5. **Production Ready**: Safe for use in automated deployment and management scripts

## Migration Guide

### For Existing Code

**Before:**
```javascript
// This could hang
await cloudpanelService.deleteSite('example.com');
```

**After:**
```javascript
// This works reliably
await cloudpanelService.deleteSite('example.com');        // Uses force by default
await cloudpanelService.deleteSite('example.com', true);  // Explicit force mode
await cloudpanelService.deleteSite('example.com', false); // Uses confirmation input
```

### API Calls

**Before:**
```bash
curl -X DELETE http://localhost:3000/api/site/delete \
  -H "Content-Type: application/json" \
  -d '{"domainName": "example.com"}'
```

**After:**
```bash
# Same call works, now with optional force parameter
curl -X DELETE http://localhost:3000/api/site/delete \
  -H "Content-Type: application/json" \
  -d '{"domainName": "example.com", "force": true}'
```

## Technical Details

### CloudPanel CLI Reference

According to the [CloudPanel CLI documentation](https://www.cloudpanel.io/docs/v2/cloudpanel-cli/root-user-commands):

- `site:delete` supports `--force` parameter to skip confirmation
- Other delete commands require confirmation input
- All delete operations can be automated with proper input handling

### Implementation Notes

1. **Default Force Mode**: Set to `true` for API consistency and reliability
2. **Input Handling**: Uses `stdin.write('yes\n')` for commands that don't support `--force`
3. **Error Handling**: Maintains existing error handling patterns
4. **Backward Compatibility**: Existing API calls continue to work without changes

## Testing

The updated implementation ensures:
- ✅ No command timeouts on deletion operations
- ✅ Proper error handling and reporting
- ✅ Consistent API response format
- ✅ Support for both force and confirmation modes
- ✅ Backward compatibility with existing integrations
