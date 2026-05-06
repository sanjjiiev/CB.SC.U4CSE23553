class MinHeap {
    constructor() {
        this.heap = [];
    }

    push(val) {
        this.heap.push(val);
        this.bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length <= 1) return this.heap.pop();
        const top = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return top;
    }

    peek() { return this.heap[0]; }
    size() { return this.heap.length; }

    bubbleUp(index) {
        while (index > 0) {
            let parent = Math.floor((index - 1) / 2);
            
            if (this.heap[parent].priority_score <= this.heap[index].priority_score) break;
            [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
            index = parent;
        }
    }

    sinkDown(index) {
        const length = this.heap.length;
        while (true) {
            let left = 2 * index + 1;
            let right = 2 * index + 2;
            let smallest = index;

            if (left < length && this.heap[left].priority_score < this.heap[smallest].priority_score) smallest = left;
            if (right < length && this.heap[right].priority_score < this.heap[smallest].priority_score) smallest = right;
            if (smallest === index) break;
            
            [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
            index = smallest;
        }
    }
}

class PriorityInbox {
    static CATEGORY_WEIGHTS = {
        'placement': 3,
        'result': 2,
        'event': 1
    };

    constructor(topN = 10) {
        this.topN = topN;
        this.minHeap = new MinHeap();
    }

    calculatePriority(notification) {
        const category = (notification.category || 'event').toLowerCase();
        const weight = PriorityInbox.CATEGORY_WEIGHTS[category] || 1;
        
        let createdAt;
        try {
            createdAt = new Date(notification.created_at);
            if (isNaN(createdAt.getTime())) throw new Error();
        } catch (e) {
            createdAt = new Date();
        }
        
        
        const now = new Date();
        const daysAgo = (now - createdAt) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 1000 - daysAgo);
        
        
        return (weight * 1000) + recencyScore;
    }

    addNotification(notification) {
        if (notification.is_read) return; 

        const priority_score = this.calculatePriority(notification);
        const priorityNotif = { priority_score, notification };

        if (this.minHeap.size() < this.topN) {
       
            this.minHeap.push(priorityNotif);
        } else if (priority_score > this.minHeap.peek().priority_score) {
           
            this.minHeap.pop();
            this.minHeap.push(priorityNotif);
        }
    }

    getTopNotifications() {
        
        return [...this.minHeap.heap]
            .sort((a, b) => b.priority_score - a.priority_score)
            .map(item => ({ ...item.notification, priority_score: item.priority_score }));
    }

    displayPriorities() {
        const topNotifications = this.getTopNotifications();
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`TOP ${topNotifications.length} PRIORITY NOTIFICATIONS`);
        console.log(`${'='.repeat(80)}\n`);
        
        topNotifications.forEach((notif, idx) => {
            const category = (notif.category || 'N/A').toUpperCase();
            const title = notif.title || 'Untitled';
            const createdAt = notif.created_at || 'N/A';
            
            console.log(`${idx + 1}. [${category}] ${title}`);
            console.log(`   Created: ${createdAt}`);
            console.log(`   Priority Score: ${notif.priority_score.toFixed(2)}`);
            console.log(`   Message: ${(notif.message || '').substring(0, 100)}...`);
            console.log();
        });
    }
}

async function fetchNotifications(apiUrl, authToken) {
    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    try {
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);
        const data = await response.json();
        
        
        if (data && data.data && data.data.notifications) return data.data.notifications;
        if (Array.isArray(data)) return data;
        return [];
    } catch (error) {
        console.error(`Error fetching notifications: ${error.message}`);
        console.log("\nUsing robust mock data for testing (API offline/unreachable)...");
        return [
            { id: 1, title: "Cultural Fest 2024", message: "Annual fest updates", category: "Event", is_read: false, created_at: "2023-11-01T09:00:00Z" },
            { id: 2, title: "TCS Interview Link", message: "Your assessment link", category: "Placement", is_read: false, created_at: "2023-11-05T10:00:00Z" },
            { id: 3, title: "Semester 5 Results", message: "Results published", category: "Result", is_read: false, created_at: "2023-11-04T12:00:00Z" },
            { id: 4, title: "Google Resume Shortlist", message: "Congratulations!", category: "Placement", is_read: false, created_at: "2023-11-06T14:00:00Z" },
            { id: 5, title: "Sports Meet Info", message: "Match brackets released", category: "Event", is_read: false, created_at: "2023-11-02T08:00:00Z" },
            { id: 6, title: "Old Placement Drive", message: "Missed drive", category: "Placement", is_read: false, created_at: "2023-10-20T10:00:00Z" },
            { id: 7, title: "Semester 4 Re-evaluation", message: "Marks updated", category: "Result", is_read: false, created_at: "2023-11-06T09:00:00Z" },
            { id: 8, title: "Hackathon Registration", message: "Last day to register", category: "Event", is_read: false, created_at: "2023-11-06T18:00:00Z" },
            { id: 9, title: "Amazon Coding Round", message: "Round 1 details", category: "Placement", is_read: false, created_at: "2023-11-07T10:00:00Z" },
            { id: 10, title: "Already Read Result", message: "You viewed this", category: "Result", is_read: true, created_at: "2023-11-08T10:00:00Z" }, // Skipped
            { id: 11, title: "Library Notice", message: "Overdue books", category: "Event", is_read: false, created_at: "2023-10-15T10:00:00Z" },
            { id: 12, title: "Wipro Offer Letter", message: "Welcome aboard", category: "Placement", is_read: false, created_at: "2023-11-08T11:00:00Z" }
        ];
    }
}

async function main() {
    const API_URL = "http://20.207.122.201/evaluation-service/notifications";
    const AUTH_TOKEN = process.env.AUTH_TOKEN;
    
    console.log("Fetching notifications from API...");
    const notifications = await fetchNotifications(API_URL, AUTH_TOKEN);
    console.log(`Fetched ${notifications.length} notifications\n`);
    
    const priorityInbox = new PriorityInbox(10);
    
    for (const notif of notifications) {
        priorityInbox.addNotification(notif);
    }
    
    priorityInbox.displayPriorities();
    
    console.log("\n" + "=".repeat(80));
    console.log("SIMULATING NEW PLACEMENT NOTIFICATION ARRIVAL");
    console.log("=".repeat(80) + "\n");
    
    const newNotification = {
        id: 'notif_new_001',
        title: 'URGENT: Google Campus Drive Tomorrow',
        message: 'Google campus recruitment drive scheduled for tomorrow. Register immediately.',
        category: 'placement',
        is_read: false,
        created_at: new Date().toISOString(),
        action_url: 'https://campus.edu/placements/google'
    };
    
    priorityInbox.addNotification(newNotification);
    priorityInbox.displayPriorities();
}

main();