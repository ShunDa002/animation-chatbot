# Interface Contract: API

## `GET /conversations`

Fetches the user's historical conversations.

**Request**:
- Method: `GET`
- Path: `/conversations`
- Headers: Standard authorization headers if applicable.

**Response (Success)**:
- Status: `200 OK`
- Body:
```json
[
  {
    "id": "string",
    "threadId": "string",
    "title": "string",
    "createdAt": "DateTime string",
    "updatedAt": "DateTime string"
  }
]
```

**Response (Error)**:
- Status: `500 Internal Server Error` (or other standard HTTP errors)
- Handled by displaying an inline error message and a 'Retry' button in the Sidebar.
