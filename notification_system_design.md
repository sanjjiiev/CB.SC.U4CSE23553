de# Stage 1

## Campus Notification Platform - API Contract & System Design

Hey team, here is the proposed REST API design and contract for the new campus notification system. I've broken down the core features we need and the endpoint structures to handle them.

### 1. Core Actions

Based on the requirements, the platform needs to handle these main actions:

1. **Fetch Notifications**: Get a list of notifications for the logged-in user. We'll definitely need pagination here, plus filters for category (`Placements`, `Events`, `Results`) and read/unread status.
2. **Mark as Read**: A simple toggle when a student clicks or views a specific notification.
3. **Mark All as Read**: A bulk update so users can clear their unread queue in one click.
4. **Get Unread Count**: A lightweight endpoint just to fetch the total unread number (useful for the little red notification badge in the UI).
5. **Create Notification (Admin)**: An endpoint for admins to blast out new alerts to specific batches or departments.

---

### 2. REST API Endpoints

#### Common Headers

All of these endpoints expect a standard JWT token for authentication.

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <JWT_ACCESS_TOKEN>"
}
```

#### A. Fetch Notifications

**Endpoint:** `GET /api/v1/notifications`
**Description:** Retrieves a list of notifications for the logged-in user.
**Query Parameters:**

- `page` (integer) - Default: 1
- `limit` (integer) - Default: 20
- `category` (string) - Optional (`placements`, `events`, `results`)
- `is_read` (boolean) - Optional

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_8f73b1a2",
        "title": "TCS Campus Drive 2024",
        "message": "The online assessment link for TCS is now active. Please check your dashboard.",
        "category": "placements",
        "is_read": false,
        "action_url": "https://campus.edu/placements/tcs",
        "created_at": "2023-10-25T10:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_records": 95
    }
  }
}
```

#### B. Mark Notification as Read

**Endpoint:** `PATCH /api/v1/notifications/:id/read`
**Description:** Updates the `is_read` status of a specific notification to true.

**Request Body:** (Empty)

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Notification marked as read successfully.",
  "data": {
    "id": "notif_8f73b1a2",
    "is_read": true
  }
}
```

#### C. Mark All Notifications as Read

**Endpoint:** `PATCH /api/v1/notifications/read-all`
**Description:** Marks all unread notifications for the logged-in student as read.

**Request Body:** (Empty)

**Response: 200 OK**

```json
{
  "success": true,
  "message": "All notifications marked as read.",
  "data": {
    "updated_count": 14
  }
}
```

#### D. Get Unread Notification Count

**Endpoint:** `GET /api/v1/notifications/unread-count`
**Description:** Fetch the count of unread notifications for UI badge updates.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "unread_count": 14
  }
}
```

#### E. Create a Notification (Admin Only)

**Endpoint:** `POST /api/v1/notifications`
**Description:** Creates a new notification. Triggers the real-time broadcast.

**Request Body:**

```json
{
  "title": "End Semester Results Declared",
  "message": "Results for Semester 5 have been published on the portal.",
  "category": "results",
  "action_url": "https://campus.edu/results/sem5",
  "target_audience": {
    "batch": "2025",
    "department": "CSE"
  }
}
```

**Response: 201 Created**

```json
{
  "success": true,
  "message": "Notification created and broadcasted successfully.",
  "data": {
    "id": "notif_9a84c2b3",
    "created_at": "2023-10-25T11:00:00Z"
  }
}
```

---

### 3. Real-Time Notification Mechanism

To support real-time updates (pushing notifications to students the moment they are created without requiring a page refresh), we will implement a **WebSocket (WS/WSS)** architecture using `Socket.io` or native WebSockets.

#### Connection Handshake

- **URL:** `wss://api.campus.edu/realtime`
- **Authentication:** The client connects passing the JWT token.
  ```json
  {
    "auth": { "token": "Bearer <JWT_ACCESS_TOKEN>" }
  }
  ```

#### Event: `new_notification`

When an admin creates a notification, the backend determines the `target_audience`. If a connected WebSocket user belongs to that cohort, the server emits a `new_notification` event to their specific socket room.

**Payload from Server to Client:**

```json
{
  "event": "new_notification",
  "payload": {
    "id": "notif_001",
    "title": "End Semester Results Declared",
    "message": "Results for Semester 5 have been published on the portal.",
    "category": "results",
    "is_read": false,
    "action_url": "https://campus.edu/results/sem5",
    "created_at": "2023-10-25"
  }
}
```

*Alternative mechanism:* **Server-Sent Events (SSE)** could also be considered if bidirectional communication (like the client sending 'typing' events) is not required, as SSE is simpler and natively supports unidirectional server-to-client event streaming over standard HTTP.
