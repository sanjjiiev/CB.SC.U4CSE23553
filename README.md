# Campus Notification Platform & Vehicle Maintenance Scheduler

This repository contains the backend microservices for two primary domains: a **Campus Notification Platform** and a **Vehicle Maintenance Scheduler**, developed using Node.js and Express.

## Features

### 1. Campus Notification System
- **RESTful APIs**: Endpoints to fetch, create, and manage read/unread status of notifications.
- **Priority Inbox**: An algorithm utilizing a Min-Heap (Priority Queue) to efficiently maintain and display the top 10 most important unread notifications based on category weight (Placement > Result > Event) and recency.
- **Real-Time Architecture**: Designed to support WebSockets for instant broadcast alerts to specific student cohorts.
- **Scalable Database Design**: Highly optimized fan-out-on-write database architecture with indexing, caching (Redis), and background message queue strategies for high scalability.

### 2. Vehicle Maintenance Scheduler
- **Optimization Engine**: Uses the **0/1 Knapsack Dynamic Programming** algorithm to maximize the operational impact of vehicle maintenance without exceeding the daily mechanic-hour budget.
- **External API Integration**: Fetches real-time mechanic budgets and vehicle task configurations from external evaluation services.

### 3. Custom Logging Middleware
- Reusable `@logging_middleware` package to securely track and dispatch application lifecycle events (info, debug, warn, error) to an external logging service using JWT authentication.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Libraries**: Axios, dotenv

## How to Run
1. Ensure you have a valid `.env` file containing your `AUTH_TOKEN`.
2. Install dependencies: 
   ```bash
   npm install
   ```
3. Run the priority inbox script: `node priority_inbox.js`
4. Run the maintenance scheduler server: `node vehicle_maintenance_scheduler/server.js`
