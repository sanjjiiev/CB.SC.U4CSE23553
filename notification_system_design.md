## Stage 1

## Campus Notification Platform - API Contract & System Design

### 1. Core Actions

Based on the requirements, the platform needs to handle these main actions:

1. **Fetch Notifications**: Get a list of notifications for the logged-in user. We'll definitely need pagination here, plus filters for category (`Placements`, `Events`, `Results`) and read/unread status.
2. **Mark as Read**: A simple toggle when a student clicks or views a specific notifications.
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

---

## Stage 2

### Database Selection

For this notification system, I recommend using **PostgreSQL**, a robust relational database. 

**Key Features**
- **ACID Compliance**: It guarantees reliable state transitions, which is crucial when thousands of students are simultaneously marking notifications as read or clearing their inboxes. We cannot afford data anomalies.
- **Relational Structure**: The platform inherently maps entities (users to their specific notifications). A relational database handles these associations naturally and efficiently.
- **Flexible JSONB Support**: Notifications can have varying metadata (e.g., dynamic `target_audience` parameters or custom `action_url` structures). PostgreSQL's `JSONB` data type allows us to store these attributes without strict schemas while still keeping them fully indexable and queryable.

### Database Schema

We'll use a "fan-out-on-write" approach. Instead of keeping an array of users inside a single notification, we'll have a main table for the notification content and a mapping table that acts as each user's personal inbox.

**1. `notifications` Table:** (Stores the actual broadcasted message)
- `id` (UUID, Primary Key)
- `title` (VARCHAR)
- `message` (TEXT)
- `category` (VARCHAR)
- `action_url` (VARCHAR, Nullable)
- `target_audience` (JSONB)
- `created_at` (TIMESTAMP, Default: CURRENT_TIMESTAMP)

**2. `user_notifications` Table:** (Tracks individual read receipts and acts as the user's feed)
- `id` (UUID, Primary Key)
- `user_id` (UUID, Indexed) - References the student
- `notification_id` (UUID, Foreign Key referencing `notifications(id)`)
- `is_read` (BOOLEAN, Default: FALSE)
- `created_at` (TIMESTAMP, Default: CURRENT_TIMESTAMP)

### Scaling Problems & Solutions

As the platform grows, we'll inevitably face data volume challenges:

1. **Table Bloat**: A single admin alert sent to 5,000 students creates 1 row in `notifications` but 5,000 rows in `user_notifications`. This mapping table will rapidly expand into millions of rows.
   - **Solution**: We should partition the `user_notifications` table by `created_at` (e.g., monthly). Students rarely check old alerts, so keeping recent data in smaller, active partitions drastically improves query speed. Additionally, we can implement a background cron job to archive or delete notifications older than 90 days.

2. **Slow Unread Counts**: Running a `COUNT(*)` query on a massive table for every page load to show the UI badge will degrade performance.
   - **Solution**: We should introduce a **Redis** caching layer. We can store a simple integer for each user's unread count in Redis, incrementing it when an alert is published and decrementing it when they mark something as read. This avoids hitting the database entirely for the unread badge.

3. **Blocking API Requests**: Trying to synchronously insert 5,000 rows into the database when an admin creates a notification can cause the API to hang and create database bottlenecks.
   - **Solution**: We must handle the "fan-out" asynchronously. When the admin hits the endpoint, we publish a job to a message broker like **RabbitMQ** or **AWS SQS** and immediately return a success response. Background workers will then pick up the job and safely insert the thousands of `user_notifications` rows in batches.

### SQL Queries (Mapping to Stage 1 APIs)

**1. Fetch Notifications (With filters and pagination)**
```sql
SELECT n.id, n.title, n.message, n.category, un.is_read, n.action_url, n.created_at
FROM notifications n
JOIN user_notifications un ON n.id = un.notification_id
WHERE un.user_id = 'current_user_uuid'
  AND n.category = 'placements' -- Optional filter
ORDER BY n.created_at DESC
LIMIT 20 OFFSET 0;
```

**2. Mark a Single Notification as Read**
```sql
UPDATE user_notifications
SET is_read = TRUE
WHERE user_id = 'current_user_uuid' 
  AND notification_id = 'specific_notif_uuid';
```

**3. Mark All Notifications as Read**
```sql
UPDATE user_notifications
SET is_read = TRUE
WHERE user_id = 'current_user_uuid' 
  AND is_read = FALSE;
```

**4. Get Unread Count** *(Fallback if not using Redis)*
```sql
SELECT COUNT(*) AS unread_count
FROM user_notifications
WHERE user_id = 'current_user_uuid' 
  AND is_read = FALSE;
```

**5. Create a Notification (Admin)**
```sql
-- Step 1: Insert the main alert
INSERT INTO notifications (id, title, message, category, action_url, target_audience)
VALUES (
  'notif_123', 
  'TCS Campus Drive', 
  'The online assessment link is active.', 
  'placements', 
  'https://campus.edu/placements/tcs', 
  '{"batch": "2025"}'
);

-- Step 2: The Async Fan-out (Inserting for all matching students)
INSERT INTO user_notifications (id, user_id, notification_id, is_read)
SELECT 
  gen_random_uuid(), 
  users.id, 
  'notif_123', 
  FALSE
FROM users
WHERE users.batch = '2025';
```
