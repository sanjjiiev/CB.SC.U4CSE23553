const axios = require('axios');
const { Log } = require('../logging_middleware');


const BASE_URL = 'http://20.207.122.201/evaluation-service';

const AUTH_CREDENTIALS = {
  email: "sanjjiiev005@gmail.com",
  name: "Sanjjiiev S",
  rollNo: "cb.sc.u4cse23553",
  accessCode: "PTBMmQ",
  clientID: "585e80db-fbc5-4983-a4a5-f1654c3dd64b",
  clientSecret: "pJEANuzmhwPZxpPG"
};


const TYPE_WEIGHTS = {
  'Placement': 3,
  'Result': 2,
  'Event': 1
};


async function authenticate() {
  try {
    const response = await axios.post(`${BASE_URL}/auth`, AUTH_CREDENTIALS);
    await Log('backend', 'info', 'auth', 'Auth successful for notifications');
    return response.data.access_token;
  } catch (error) {
    await Log('backend', 'fatal', 'auth', 'Auth failed for notification app');
    process.exit(1);
  }
}

async function fetchNotifications(token) {
  try {
    const response = await axios.get(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const notifications = response.data.notifications;
    await Log('backend', 'info', 'service', `Fetched ${notifications.length} notifications`);
    return notifications;
  } catch (error) {
    await Log('backend', 'error', 'service', 'Failed to fetch notifications');
    process.exit(1);
  }
}

class MinHeap {
  constructor(capacity) {
    this.capacity = capacity;
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  insert(item) {
    if (this.heap.length < this.capacity) {
      this.heap.push(item);
      this._bubbleUp(this.heap.length - 1);
    } else if (item.score > this.heap[0].score) {
      this.heap[0] = item;
      this._sinkDown(0);
    }
  }

  extractSorted() {
    return [...this.heap].sort((a, b) => b.score - a.score);
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].score <= this.heap[index].score) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  _sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.heap[left].score < this.heap[smallest].score) {
        smallest = left;
      }
      if (right < length && this.heap[right].score < this.heap[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

function calculateScore(notification) {
  const weight = TYPE_WEIGHTS[notification.Type] || 0;
  const timestampMs = new Date(notification.Timestamp).getTime();
  return (weight * 1e12) + timestampMs;
}

/**
 * @param {Array} notifications 
 * @param {number} n 
 * @returns {Array} 
 */
function getTopNPriority(notifications, n) {
  const heap = new MinHeap(n);

  for (const notification of notifications) {
    const score = calculateScore(notification);
    heap.insert({ ...notification, score });
  }

  return heap.extractSorted();
}

function printNotifications(topN, totalCount) {
  console.log(`\n  Showing Top ${topN.length} Priority Notifications (out of ${totalCount} total)`);
  console.log(`  Priority: Placement > Result > Event `);
  console.log(`  Within same type, more recent notifications rank higher.\n`);

  
  topN.forEach((notif, index) => {
    const rank = String(index + 1).padStart(2);
    const type = notif.Type.padEnd(10);
    const msg = notif.Message.length > 40
      ? notif.Message.substring(0, 37) + '...'
      : notif.Message.padEnd(40);
    const ts = notif.Timestamp.padEnd(22);
    console.log(`  | ${rank} | ${type} | ${msg} | ${ts} |`);
  });

}

async function main() {
  const TOP_N = 10;

  console.log('\n--- Campus Notification Priority Inbox ---\n');

  console.log('Authenticating...');
  const token = await authenticate();

  console.log('Fetching notifications...');
  const notifications = await fetchNotifications(token);

  console.log(`Computing top ${TOP_N} priority notifications...\n`);
  const topN = getTopNPriority(notifications, TOP_N);

  printNotifications(topN, notifications.length);

  await Log('backend', 'info', 'service', `Top ${TOP_N} priority notifs computed`);

  
  console.log('  When a new notification arrives:');
  console.log('    1. Calculate its priority score');
  console.log('    2. Compare with the min-heap root ');
  console.log('    3. If higher, replace root and re-heapify');
  console.log('    4. If lower, discard');
  

  console.log('Done!\n');
}

main();