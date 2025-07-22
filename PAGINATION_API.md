# Sites API Pagination Documentation

## Overview
The sites API now supports pagination to efficiently handle large numbers of sites. The API returns paginated results with metadata about the current page, total items, and navigation options.

## API Endpoint
```
GET /api/list
```

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 10 | Number of items per page (max 100) |
| `sortBy` | string | 'domain' | Field to sort by (domain, user, type, created, modified, size) |
| `sortOrder` | string | 'asc' | Sort order ('asc' or 'desc') |

## Example Requests

### Basic pagination (10 items per page)
```
GET /api/list
```

### Custom page and limit
```
GET /api/list?page=2&limit=20
```

### Sort by creation date (newest first)
```
GET /api/list?sortBy=created&sortOrder=desc
```

### Sort by user and size
```
GET /api/list?sortBy=user&sortOrder=asc&page=1&limit=5
```

## Response Format

```json
{
  "success": true,
  "message": "Sites retrieved successfully",
  "data": [
    {
      "user": "example_user",
      "domain": "example.com",
      "type": "Laravel",
      "framework": "Laravel",
      "ssl": true,
      "path": "/home/example_user/htdocs/example.com",
      "database": "example_db",
      "database_user": "example_user",
      "database_password": "password",
      "app_key": "base64:key",
      "created": "2024-01-01T00:00:00.000Z",
      "modified": "2024-01-15T12:00:00.000Z",
      "size": 1048576
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total_items": 45,
    "total_pages": 5,
    "has_next_page": true,
    "has_prev_page": false,
    "next_page": 2,
    "prev_page": null,
    "start_index": 1,
    "end_index": 10
  }
}
```

## Pagination Metadata

| Field | Type | Description |
|-------|------|-------------|
| `current_page` | integer | Current page number |
| `per_page` | integer | Number of items per page |
| `total_items` | integer | Total number of items |
| `total_pages` | integer | Total number of pages |
| `has_next_page` | boolean | Whether there's a next page |
| `has_prev_page` | boolean | Whether there's a previous page |
| `next_page` | integer/null | Next page number (null if no next page) |
| `prev_page` | integer/null | Previous page number (null if no previous page) |
| `start_index` | integer | Index of first item on current page |
| `end_index` | integer | Index of last item on current page |

## Sortable Fields

- `domain`: Site domain name
- `user`: Username/owner
- `type`: Site type (Laravel, WordPress, etc.)
- `created`: Creation date
- `modified`: Last modification date
- `size`: Directory size in bytes

## Error Response

```json
{
  "success": false,
  "message": "Failed to retrieve sites list",
  "error": "Error description"
}
```

## Usage Examples

### Frontend Pagination Implementation

```javascript
// Get first page of sites
const response = await fetch('/api/list?page=1&limit=10');
const data = await response.json();

if (data.success) {
  const sites = data.data;
  const pagination = data.pagination;
  
  // Display sites
  sites.forEach(site => {
    console.log(`${site.domain} (${site.type})`);
  });
  
  // Handle pagination
  if (pagination.has_next_page) {
    console.log(`Next page: ${pagination.next_page}`);
  }
  
  if (pagination.has_prev_page) {
    console.log(`Previous page: ${pagination.prev_page}`);
  }
}
```

### Building Pagination Controls

```javascript
function buildPaginationControls(pagination) {
  const controls = [];
  
  // Previous button
  if (pagination.has_prev_page) {
    controls.push(`<a href="?page=${pagination.prev_page}">Previous</a>`);
  }
  
  // Page numbers
  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === pagination.current_page) {
      controls.push(`<span class="current">${i}</span>`);
    } else {
      controls.push(`<a href="?page=${i}">${i}</a>`);
    }
  }
  
  // Next button
  if (pagination.has_next_page) {
    controls.push(`<a href="?page=${pagination.next_page}">Next</a>`);
  }
  
  return controls.join(' ');
}
```

## Notes

- Maximum limit is 100 items per page
- Page numbers start from 1
- Date sorting uses timestamp comparison
- String sorting is case-insensitive
- The API maintains backward compatibility for existing integrations 