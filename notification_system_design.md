# Campus Notification Platform - System Design Document

## Stage 1: API Contract & System Design

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

**Alternative mechanism:** **Server-Sent Events (SSE)** could also be considered if bidirectional communication (like the client sending 'typing' events) is not required, as SSE is simpler and natively supports unidirectional server-to-client event streaming over standard HTTP.

---

## Stage 2: Database Design & Scaling Strategy

### Database Selection

For this notification system, I recommend using **PostgreSQL**, a robust relational database.

**Key Features:**

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

**4. Get Unread Count** (Fallback if not using Redis)

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

---

## Stage 3: Database Query Optimization

### Database Query Analysis & Optimization

#### Context

The relational database (MySQL/PostgreSQL) has scaled to **50,000 students** and **5,000,000 notifications**. The following query, written to fetch all unread notifications for a student, is now performing slowly:

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

---

### 1. Is This Query Accurate?

The query is **functionally correct** — it does retrieve the right data. However, it has two significant problems:

- **`SELECT *`**: This selects every column in the table, including large `TEXT` fields like `message` or `JSONB` blobs. This unnecessarily increases I/O, network transfer, and memory usage. Best practice is to **select only the columns the API actually needs** (e.g., `id`, `title`, `message`, `isRead`, `createdAt`).
- **Schema mismatch with Stage 2 design**: The Stage 2 schema uses a two-table design (`notifications` + `user_notifications`) to separate notification content from per-user read status. This single-table query implies a denormalized design where `studentID` and `isRead` live directly on the `notifications` table — which would cause massive data duplication (one row per student per notification). At 5,000,000 rows for 50,000 students, this is the expected outcome of that anti-pattern.

---

### 2. Why Is This Query Slow?

With 5,000,000 rows and no indexes, the database performs a **Full Table Scan** — it reads every single row to find matches. Here's the breakdown:

| Root Cause                            | Explanation                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No index on `studentID`**   | The DB cannot jump to student 1042's rows; it scans all 5M rows.                                                                                   |
| **No index on `isRead`**      | Even after filtering by `studentID`, filtering unread rows requires checking each row individually.                                              |
| **`ORDER BY createdAt DESC`** | Without an index covering the sort column, the DB must load all matching rows into memory, sort them in-place (filesort), and then return results. |
| **`SELECT *`**                | Fetches all columns, increasing data read from disk per row (especially TEXT/JSONB fields).                                                        |

**Estimated Computation Cost (without indexes):**

- The query planner performs a sequential scan over **~5,000,000 rows**.
- For a student with, say, **200 unread notifications**, it reads 5M rows to find 200 — an efficiency of **0.004%**.
- Time complexity: **O(N)** where N = total rows = 5,000,000.
- On a typical server, this translates to **hundreds of milliseconds to several seconds** per API call.

---

### 3. What Would You Change?

#### Fix 1: Create a Composite Index

The most impactful change is adding a **composite index** that covers all three parts of the query — the filter columns and the sort column:

```sql
-- For PostgreSQL
CREATE INDEX idx_notifications_student_read_created
ON notifications (studentID, isRead, createdAt DESC);
```

**Why this works:**

- The DB uses the index to **instantly locate** rows for `studentID = 1042`.
- Within those rows, it then filters `isRead = false` using the index (no row-by-row scan).
- The `createdAt DESC` is already ordered within the index, so **no filesort is needed**.
- Time complexity drops from **O(N)** to approximately **O(log N + K)**, where K is the number of matching unread notifications for that student.

#### Fix 2: Replace `SELECT *` with Specific Columns

```sql
SELECT id, title, message, isRead, createdAt
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

This reduces the volume of data transferred from disk and over the network per query.

#### Fix 3: Add Pagination

Without a `LIMIT`, the query could return thousands of rows in a single response. Always paginate:

```sql
SELECT id, title, message, isRead, createdAt
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```

**Estimated Cost After Optimization:**

- Index lookup: **O(log 5,000,000) ≈ ~23 comparisons** to reach the B-tree leaf node.
- Index scan for unread rows: reads only the student's unread entries (~200 rows vs. 5M).
- No filesort; results are pre-ordered in the index.
- Expected query time: **< 5 milliseconds** — a **100x to 1000x improvement**.

---

### 4. Is Adding Indexes on Every Column a Good Idea?

**No. This is ineffective and actively harmful.** Here's why:

| Concern                                        | Detail                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Write performance degrades**           | Every `INSERT`, `UPDATE`, or `DELETE` must also update all indexes on that table. With 10+ indexes, writes become significantly slower. In a notification system that inserts thousands of rows during a fan-out, this is a critical bottleneck. |
| **Increased disk usage**                 | Each index is stored as a separate B-tree data structure on disk. Indexing every column on a 5M-row table can consume gigabytes of additional storage.                                                                                                     |
| **Query planner confusion**              | The database query planner must evaluate all available indexes to pick the best one. Too many indexes can actually lead to suboptimal query plans or unnecessary overhead in planning.                                                                     |
| **Low-cardinality columns are wasteful** | A column like `isRead` has only 2 possible values (`true`/`false`). A standalone index on it is near-useless because half the table matches either value — the DB would still scan most rows.                                                       |
| **Composite index is superior**          | A single well-designed composite index on `(studentID, isRead, createdAt DESC)` outperforms three separate indexes on each column individually, because it covers the entire query in one index traversal.                                               |

**The right approach** is **selective, query-driven indexing**: analyze the most frequent and slowest queries, then create targeted indexes that satisfy those exact access patterns.

---

### 5. Query: All Students Who Received a Placement Notification in the Last 7 Days

Given the table has a `notificationType` column using a `notification_type` enum (`'Event'`, `'Result'`, `'Placement'`):

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

**Explanation:**

- `notificationType = 'Placement'` — filters using the enum value to match only placement alerts.
- `createdAt >= NOW() - INTERVAL '7 days'` — restricts results to notifications created within the last 7 days. Use `INTERVAL 7 DAY` in MySQL syntax instead.
- `SELECT DISTINCT studentID` — ensures each student appears only once, even if they received multiple placement notifications in the window.

**Recommended Supporting Index:**

```sql
CREATE INDEX idx_notifications_type_created
ON notifications (notificationType, createdAt DESC);
```

This allows the DB to efficiently filter by type and scan only the recent time window, avoiding a full table scan on 5,000,000 rows.

---

## Stage 4: Caching & Performance Optimization

### Problem Statement

With **50,000 active students**, the database is under constant load from notification fetch requests. Even with optimized indexes, querying the database on every single page load creates unsustainable load and degrades user experience.

---

### Optimization Strategies

#### Strategy 1: Server-Side Caching with Redis

**Implementation Approach:**

The API layer integrates a Redis cache between the application server and PostgreSQL database. When a notification fetch request arrives, the system first checks Redis for cached data. Only on cache misses does it query the database.

**Architecture Flow:**

```
Client Request → API Server → Redis Cache Check
                                    ↓ (Cache Miss)
                              PostgreSQL Query
                                    ↓
                           Cache Result in Redis (TTL: 60s)
                                    ↓
                              Return Response
```

**Cache Key Structure:**

```
notifications:student:{student_id}:unread:page:{page_number}
```

**Benefits:**

- Dramatically reduces database query load by 80-95%
- Sub-millisecond response times from memory-based lookups
- Handles thousands of concurrent requests efficiently

**Challenges:**

- Requires cache invalidation logic when notifications are marked as read or new notifications arrive
- Potential for stale data within the TTL window (acceptable for non-critical notifications)
- Additional infrastructure complexity and monitoring requirements

---

#### Strategy 2: Unread Count Caching

**Implementation Approach:**

Rather than caching entire notification lists, maintain only the unread count in Redis as an atomic counter. This targets the highest-frequency operation: displaying the notification badge.

**Cache Operations:**

```
Redis Key: unread_count:student:{student_id}

Operations:
- INCR: When new notification is pushed to student
- DECR: When notification is marked as read
- SET 0: When "Mark All as Read" is triggered
```

**Benefits:**

- Eliminates all database queries for badge display
- Minimal memory footprint (single integer per student)
- Simple atomic operations prevent race conditions
- Easy to implement and maintain

**Challenges:**

- Counter drift risk if database writes succeed but Redis updates fail
- Requires reconciliation jobs to periodically sync counts with database

---

#### Strategy 3: Lazy Loading with Pagination

**Implementation Approach:**

Notifications are not fetched during page load. Instead, they load only when the user explicitly opens the notification panel, and only the first page (10-20 items) is retrieved initially. Subsequent pages load on scroll.

**Query Pattern:**

```sql
SELECT id, title, message, isRead, createdAt
FROM notifications
WHERE studentID = ? AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```

**Benefits:**

- Zero unnecessary queries - no preloading on every page load
- Reduced network payload and faster rendering
- No additional infrastructure required
- Significant immediate load reduction

**Challenges:**

- Slight delay when user first opens notification panel
- Requires frontend implementation of lazy loading patterns
- Must handle loading states in UI

---

#### Strategy 4: HTTP Caching with ETags

**Implementation Approach:**

Leverage HTTP caching mechanisms by including `ETag` and `Cache-Control` headers in API responses. The browser caches responses locally and validates freshness using conditional requests.

**HTTP Header Flow:**

```
First Request:
Response Headers: 
  ETag: "hash_of_response_content"
  Cache-Control: max-age=30

Subsequent Request (within 30s):
  Browser uses local cache (0 server requests)

After 30s:
Request Headers: If-None-Match: "hash_of_response_content"
Response: 304 Not Modified (if unchanged)
```

**Benefits:**

- Zero server load for repeat visits within cache window
- No backend infrastructure changes needed
- Reduces bandwidth consumption significantly

**Challenges:**

- ETag computation still requires data fetching for comparison
- Not suitable for real-time critical notifications
- Should be combined with WebSocket push for cache invalidation

---

#### Strategy 5: Background Pre-Computation with Message Queues

**Implementation Approach:**

Proactively compute and cache notification feeds when new notifications are created, rather than computing them reactively on each request.

**System Flow:**

```
Admin Creates Notification
        ↓
Publish Event to Message Queue (RabbitMQ/SQS)
        ↓
Background Workers Process Fan-Out
        ↓
Pre-compute Notification Feeds Per Student
        ↓
Store Results in Redis Cache
        ↓
Student Page Load → Instant Response from Cache
```

**Benefits:**

- Near-instant page load times with pre-computed results
- Database load shifted to controlled background processing
- Can batch operations for efficiency

**Challenges:**

- Highest implementation complexity
- Potential memory spike when broadcasting to 50,000 students
- Eventual consistency window between notification creation and cache update
- Requires robust message queue and worker pool infrastructure

---

### Recommended Combined Approach

The optimal solution layers multiple complementary strategies:

| Priority | Strategy | Primary Impact |
| --- | --- | --- |
| **1** | Lazy-load notifications only when drawer opens | Eliminates unnecessary queries immediately |
| **2** | Cache unread count in Redis | Removes most frequent database hit |
| **3** | Cache notification list with 60s TTL | Reduces database reads by ~90% |
| **4** | Implement HTTP Cache-Control headers | Eliminates repeat server requests |
| **5** | Enforce strict pagination (max 20 items) | Reduces query cost and payload size |

**Expected Impact:**

This layered approach can reduce database query volume from **50,000+ queries per page load cycle** to a few hundred cache misses, achieving:

- 90-95% reduction in database load
- Sub-50ms average API response times
- Smooth, responsive user experience
- Minimal infrastructure additions (primarily Redis)

---

## Stage 5: Reliable Bulk Notification System

### Problem Analysis

The current implementation for bulk notifications has critical flaws:

```python
def notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)      # calls Email API
        save_to_db(student_id, message)      # DB insert
        push_to_app(student_id, message)     # real-time push
```

### Identified Shortcomings

#### 1. Synchronous Sequential Processing

**Problem:** Processing 50,000 students one-by-one in a loop is catastrophically slow. At 100ms per iteration (email + DB + push), this takes **83 minutes** to complete.

**Impact:** The admin's HTTP request times out. Students receive notifications over an hour-long window instead of simultaneously.

#### 2. No Fault Tolerance

**Problem:** When `send_email` fails for student #30,200, the entire operation crashes. Students #1-30,199 received emails, but students #30,201-50,000 received nothing. There's no retry mechanism, no error handling, and no way to resume.

**Impact:** Partial delivery creates inconsistent system state. No audit trail exists to identify which students were skipped.

#### 3. No Transactional Guarantees

**Problem:** Each operation (email, DB, push) happens independently. If `send_email` succeeds but `save_to_db` fails, the student receives an email but the notification doesn't appear in their app.

**Impact:** Data inconsistency across channels. Users report "I got the email but don't see it in the app."

#### 4. Blocking API Response

**Problem:** The admin must wait 83+ minutes for the function to complete before receiving a response.

**Impact:** Poor UX. The admin can't confirm whether the notification was queued successfully.

#### 5. No Rate Limiting

**Problem:** Blasting 50,000 emails to the email service provider in rapid succession likely triggers rate limits, causing failures or IP blacklisting.

**Impact:** Email deliverability drops. Notifications get marked as spam.

---

### Design Questions

#### Should DB Insert and Email Send Happen Together?

**Answer: No. They should be decoupled.**

**Reasoning:**

| Aspect | Explanation |
| --- | --- |
| **Different reliability requirements** | DB writes are internal and fast (5-10ms). Email delivery depends on external APIs that can be slow (500ms+) or fail intermittently. |
| **Failure domains** | If the email service is down, we shouldn't block database persistence. The notification should still be saved and visible in-app. |
| **Retry logic** | Emails can be retried asynchronously from a dead-letter queue. DB writes should succeed on first attempt. |
| **Atomicity** | The critical atomic operation is: *Create notification record + fan-out to user_notifications table*. Email is a side effect that can happen asynchronously. |

**Correct Approach:**

1. Atomically save the notification and create `user_notifications` entries in a database transaction
2. Queue email jobs asynchronously to a message broker
3. Background workers process email queue with retries

---

### Redesigned Architecture

#### High-Level Flow

```
Admin clicks "Notify All"
        ↓
API validates request & returns 202 Accepted immediately
        ↓
Publish single job to Message Queue (RabbitMQ/SQS)
        ↓
Background Worker picks up job
        ↓
┌─────────────────────────────────────────┐
│  Database Transaction (Atomic):         │
│  1. Insert into notifications table     │
│  2. Batch insert into user_notifications│
│  3. Commit transaction                  │
└─────────────────────────────────────────┘
        ↓
For each student in batch (chunked 500):
  ├─ Publish email job to Email Queue
  └─ Publish push notification to WebSocket service
        ↓
Separate Email Workers process queue with retries
```

---

### Revised Pseudocode

```python
from message_queue import publish_job
from database import db_transaction
import uuid

def notify_all(student_ids: list, message: dict) -> dict:
    """
    API endpoint handler - returns immediately after queuing job
    """
    notification_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    
    # Publish job to message queue
    job_payload = {
        'job_id': job_id,
        'notification_id': notification_id,
        'student_ids': student_ids,
        'message': message,
        'created_at': datetime.utcnow()
    }
    
    publish_job(queue='notifications.fanout', payload=job_payload)
    
    # Return immediately to admin
    return {
        'status': 'accepted',
        'job_id': job_id,
        'notification_id': notification_id,
        'message': 'Notification queued successfully. Processing in background.'
    }, 202


def process_notification_fanout(job_payload: dict):
    """
    Background worker - processes the actual fan-out
    """
    notification_id = job_payload['notification_id']
    student_ids = job_payload['student_ids']
    message = job_payload['message']
    
    try:
        # Step 1: Atomic database operation
        with db_transaction() as txn:
            # Insert main notification record
            txn.execute("""
                INSERT INTO notifications (id, title, message, category, action_url, target_audience, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """, (notification_id, message['title'], message['body'], 
                  message['category'], message['action_url'], message['target_audience']))
            
            # Batch insert user_notification mappings (chunks of 1000)
            for chunk in chunks(student_ids, 1000):
                values = [(str(uuid.uuid4()), student_id, notification_id, False) 
                          for student_id in chunk]
                txn.executemany("""
                    INSERT INTO user_notifications (id, user_id, notification_id, is_read)
                    VALUES (%s, %s, %s, %s)
                """, values)
            
            txn.commit()
        
        # Step 2: Queue async operations (non-blocking)
        for chunk in chunks(student_ids, 500):
            # Queue email jobs
            publish_job(queue='emails.send', payload={
                'notification_id': notification_id,
                'student_ids': chunk,
                'message': message
            })
            
            # Publish to WebSocket service for real-time push
            publish_to_websocket(student_ids=chunk, notification_data={
                'id': notification_id,
                'title': message['title'],
                'message': message['body'],
                'category': message['category'],
                'is_read': False,
                'action_url': message['action_url'],
                'created_at': datetime.utcnow().isoformat()
            })
        
        # Update job status
        update_job_status(job_payload['job_id'], 'completed')
        
    except Exception as e:
        log_error(f"Fan-out failed for job {job_payload['job_id']}: {str(e)}")
        update_job_status(job_payload['job_id'], 'failed', error=str(e))
        # Publish to dead-letter queue for manual intervention
        publish_job(queue='notifications.dlq', payload=job_payload)
        raise


def process_email_batch(email_job: dict):
    """
    Email worker - processes email sending with retries
    """
    notification_id = email_job['notification_id']
    student_ids = email_job['student_ids']
    message = email_job['message']
    
    failed_students = []
    
    for student_id in student_ids:
        try:
            student_email = get_student_email(student_id)
            
            send_email(
                to=student_email,
                subject=message['title'],
                body=message['body'],
                notification_id=notification_id
            )
            
            # Log successful delivery
            log_email_delivery(student_id, notification_id, 'sent')
            
        except RateLimitError:
            # Exponential backoff
            time.sleep(calculate_backoff(retry_count))
            failed_students.append(student_id)
            
        except EmailServiceError as e:
            # Log failure and add to retry queue
            log_email_delivery(student_id, notification_id, 'failed', error=str(e))
            failed_students.append(student_id)
    
    # Retry failed emails
    if failed_students:
        retry_count = email_job.get('retry_count', 0)
        if retry_count < MAX_RETRIES:
            publish_job(queue='emails.send', payload={
                'notification_id': notification_id,
                'student_ids': failed_students,
                'message': message,
                'retry_count': retry_count + 1
            }, delay=calculate_backoff(retry_count))
        else:
            # Move to dead-letter queue after max retries
            publish_job(queue='emails.dlq', payload={
                'notification_id': notification_id,
                'failed_student_ids': failed_students,
                'message': message
            })


def publish_to_websocket(student_ids: list, notification_data: dict):
    """
    Push notification to connected WebSocket clients
    """
    for student_id in student_ids:
        # Check if student has active WebSocket connection
        if is_connected(student_id):
            emit_to_student(student_id, event='new_notification', data=notification_data)
            
            # Increment unread count in Redis
            redis_client.incr(f'unread_count:student:{student_id}')
```

---

### Key Improvements

| Improvement | Benefit |
| --- | --- |
| **Asynchronous processing** | Admin gets instant 202 response; processing happens in background |
| **Atomic database writes** | All DB operations succeed or fail together; no partial state |
| **Chunked batch processing** | Handles 50,000 students in manageable chunks; prevents memory overflow |
| **Retry mechanism** | Failed email deliveries retry with exponential backoff |
| **Dead-letter queue** | Failed jobs after max retries go to DLQ for manual investigation |
| **Rate limiting protection** | Chunked processing prevents API rate limit violations |
| **Observability** | Job status tracking allows admin to monitor progress |
| **Decoupled operations** | DB, email, and push notifications are independent; one failure doesn't cascade |

---

### Handling the "200 Students Failed" Scenario

**With the redesigned system:**

1. **Database writes already completed** for all 50,000 students - notifications are visible in-app
2. **Email worker logs failures** for the 200 students to the database
3. **Retry mechanism automatically** re-attempts delivery with exponential backoff
4. **After max retries**, failed emails move to dead-letter queue
5. **Monitoring dashboard** alerts admin to check DLQ
6. **Manual intervention** options:
   - Investigate email service issue
   - Re-queue specific student IDs for retry
   - Contact students via alternative channel

**Result:** System remains resilient. 49,800 students received all notifications. The 200 failures are isolated, logged, and recoverable.

---

## Stage 6: Priority Inbox Implementation

### Approach Overview

The priority inbox requires dynamically ranking unread notifications based on:

1. **Weight**: `placement (3)` > `result (2)` > `event (1)`
2. **Recency**: Newer notifications rank higher

**Scoring Formula:**

```
priority_score = (weight × 1000) + (recency_score)
```

Where `recency_score` is calculated as days since notification was created, inverted so recent notifications score higher.

### Efficient Maintenance Strategy

Rather than sorting the entire notification list on every request, we use a **Min-Heap (Priority Queue)** with a fixed capacity of 10. This provides:

- **O(log 10)** insertion time for each new notification
- **O(1)** access to the top 10 priorities
- **O(10 log 10)** maintenance when new notifications arrive

As new notifications stream in, we compare their priority score against the minimum in the heap. If higher, we evict the minimum and insert the new notification.

### Implementation

I'll create a Python implementation that fetches notifications from the provided API and maintains a priority queue:

```python
import requests
import heapq
from datetime import datetime
from typing import List, Dict
from dataclasses import dataclass, field

@dataclass(order=True)
class PriorityNotification:
    priority_score: float
    notification: Dict = field(compare=False)

class PriorityInbox:
    CATEGORY_WEIGHTS = {
        'placement': 3,
        'result': 2,
        'event': 1
    }
    
    def __init__(self, top_n: int = 10):
        self.top_n = top_n
        self.min_heap: List[PriorityNotification] = []
    
    def calculate_priority(self, notification: Dict) -> float:
        """
        Calculate priority score based on category weight and recency
        """
        category = notification.get('category', 'event').lower()
        weight = self.CATEGORY_WEIGHTS.get(category, 1)
        
        # Parse created_at timestamp
        created_at_str = notification.get('created_at', '')
        try:
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        except:
            created_at = datetime.now()
        
        # Calculate days ago (inverted for scoring)
        days_ago = (datetime.now(created_at.tzinfo) - created_at).total_seconds() / 86400
        recency_score = max(0, 1000 - days_ago)  # Recent notifications score higher
        
        # Combined score
        priority_score = (weight * 1000) + recency_score
        
        return priority_score
    
    def add_notification(self, notification: Dict):
        """
        Add a notification to the priority queue maintaining top N
        """
        if notification.get('is_read', False):
            return  # Skip read notifications
        
        priority_score = self.calculate_priority(notification)
        priority_notif = PriorityNotification(
            priority_score=priority_score,
            notification=notification
        )
        
        if len(self.min_heap) < self.top_n:
            # Heap not full, add directly
            heapq.heappush(self.min_heap, priority_notif)
        else:
            # Heap full, check if new notification has higher priority
            if priority_score > self.min_heap[0].priority_score:
                heapq.heapreplace(self.min_heap, priority_notif)
    
    def get_top_notifications(self) -> List[Dict]:
        """
        Get top N notifications sorted by priority (highest first)
        """
        # Extract and sort in descending order
        sorted_notifications = sorted(
            self.min_heap,
            key=lambda x: x.priority_score,
            reverse=True
        )
        
        return [pn.notification for pn in sorted_notifications]
    
    def display_priorities(self):
        """
        Display the top priority notifications
        """
        top_notifications = self.get_top_notifications()
        
        print(f"\n{'='*80}")
        print(f"TOP {len(top_notifications)} PRIORITY NOTIFICATIONS")
        print(f"{'='*80}\n")
        
        for idx, notif in enumerate(top_notifications, 1):
            category = notif.get('category', 'N/A').upper()
            title = notif.get('title', 'Untitled')
            created_at = notif.get('created_at', 'N/A')
            priority_score = self.calculate_priority(notif)
            
            print(f"{idx}. [{category}] {title}")
            print(f"   Created: {created_at}")
            print(f"   Priority Score: {priority_score:.2f}")
            print(f"   Message: {notif.get('message', '')[:100]}...")
            print()

def fetch_notifications(api_url: str, auth_token: str) -> List[Dict]:
    """
    Fetch notifications from the API
    """
    headers = {
        'Authorization': f'Bearer {auth_token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # Adjust based on actual API response structure
        if isinstance(data, dict):
            return data.get('data', {}).get('notifications', [])
        return data
    
    except requests.exceptions.RequestException as e:
        print(f"Error fetching notifications: {e}")
        return []

def main():
    # API Configuration
    API_URL = "http://20.207.122.201/evaluation-service/notifications"
    AUTH_TOKEN = "YOUR_AUTH_TOKEN_HERE"  # Replace with actual token
    
    # Fetch notifications
    print("Fetching notifications from API...")
    notifications = fetch_notifications(API_URL, AUTH_TOKEN)
    print(f"Fetched {len(notifications)} notifications\n")
    
    # Initialize priority inbox
    priority_inbox = PriorityInbox(top_n=10)
    
    # Process each notification
    for notification in notifications:
        priority_inbox.add_notification(notification)
    
    # Display top priorities
    priority_inbox.display_priorities()
    
    # Demonstrate adding a new urgent notification
    print("\n" + "="*80)
    print("SIMULATING NEW PLACEMENT NOTIFICATION ARRIVAL")
    print("="*80 + "\n")
    
    new_notification = {
        'id': 'notif_new_001',
        'title': 'URGENT: Google Campus Drive Tomorrow',
        'message': 'Google campus recruitment drive scheduled for tomorrow. Register immediately.',
        'category': 'placement',
        'is_read': False,
        'created_at': datetime.now().isoformat(),
        'action_url': 'https://campus.edu/placements/google'
    }
    
    priority_inbox.add_notification(new_notification)
    priority_inbox.display_priorities()

if __name__ == "__main__":
    main()
```

### Code Explanation

**Data Structure Choice:**

- **Min-Heap**: Maintains the top-10 with the minimum priority score at the root
- **Fixed Capacity**: Limits heap size to exactly 10 items
- **O(log 10) Insertion**: Constant-time complexity regardless of total notification count

**Priority Calculation:**

```python
priority_score = (category_weight × 1000) + recency_score

Where:
- category_weight: placement=3, result=2, event=1
- recency_score: 1000 - days_ago (recent = higher score)
```

**Handling New Notifications:**

When a new notification arrives:

1. Calculate its priority score
2. If heap is not full (< 10 items), insert directly
3. If heap is full, compare with minimum:
   - If new score > minimum score: evict minimum, insert new
   - Otherwise: discard new notification

**Time Complexity:**

- Adding N notifications: **O(N log 10) = O(N)** (effectively linear since log 10 is constant)
- Maintaining top 10: **O(1)** space, **O(log 10)** per operation
- Retrieving top 10: **O(10 log 10) = O(1)** (constant since sorting 10 items)

### Usage Instructions

1. Replace `YOUR_AUTH_TOKEN_HERE` with the actual authentication token for the API
2. Run the script: `python priority_inbox.py`
3. The output will display the top 10 priority notifications with their scores
4. A simulation demonstrates how a new urgent placement notification gets prioritized

### Maintenance Efficiency

The heap-based approach ensures:

- **Streaming compatibility**: New notifications integrate without full re-sorting
- **Memory efficiency**: Only stores top 10 notifications in heap
- **Predictable performance**: O(log 10) regardless of total notification volume
- **Real-time updates**: Can handle continuous notification streams

This implementation provides a production-ready priority inbox that scales efficiently even with thousands of incoming notifications.

---

