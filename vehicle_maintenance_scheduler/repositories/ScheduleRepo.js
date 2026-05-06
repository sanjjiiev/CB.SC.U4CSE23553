const Task = require('../models/Task');

const BUDGET_API_URL = 'http://20.207.122.201/evaluation-service/depots';
const TASKS_API_URL = 'http://20.207.122.201/evaluation-service/vehicles';

class ScheduleRepo {
    async fetchBudget() {
        try {
            const response = await fetch(BUDGET_API_URL, {
                headers: {
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJzYW5qamlpZXYwMDVAZ21haWwuY29tIiwiZXhwIjoxNzc4MDU5MDc1LCJpYXQiOjE3NzgwNTgxNzUsImlzcyI6IkFmZm9yZCBNZWRpY2FsIFRlY2hub2xvZ2llcyBQcml2YXRlIExpbWl0ZWQiLCJqdGkiOiI5NTQzMmY3Ni1lNWM2LTQwMjYtYjQzNC1iZGE2Nzg0MDEwYjgiLCJsb2NhbGUiOiJlbi1JTiIsIm5hbWUiOiJzYW5qamlpZXYgcyIsInN1YiI6IjU4NWU4MGRiLWZiYzUtNDk4My1hNGE1LWYxNjU0YzNkZDY0YiJ9LCJlbWFpbCI6InNhbmpqaWlldjAwNUBnbWFpbC5jb20iLCJuYW1lIjoic2FuamppaWV2IHMiLCJyb2xsTm8iOiJjYi5zYy51NGNzZTIzNTUzIiwiYWNjZXNzQ29kZSI6IlBUQk1tUSIsImNsaWVudElEIjoiNTg1ZTgwZGItZmJjNS00OTgzLWE0YTUtZjE2NTRjM2RkNjRiIiwiY2xpZW50U2VjcmV0IjoicEpFQU51em1od1BaeHBQRyJ9.WyTv9ak850ARDMAZvJogsgxrrvLB7fp3VqicWq_mD5A'
                }
            });
            if (!response.ok) {
                throw new Error(`API returned HTTP status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.depots) {
                return data.depots.reduce((total, depot) => total + depot.MechanicHours, 0);
            } else if (Array.isArray(data)) {
               
                return data.reduce((total, depot) => total + (depot.MechanicHours || 0), 0);
            }
            return 40;
        } catch (error) {
            console.error('Failed to fetch budget API, using fallback:', error.message);
            return 40; 
        }
    }

    async fetchTasks() {
        try {
            const response = await fetch(TASKS_API_URL, {
                headers: {
                    
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJzYW5qamlpZXYwMDVAZ21haWwuY29tIiwiZXhwIjoxNzc4MDU5MDc1LCJpYXQiOjE3NzgwNTgxNzUsImlzcyI6IkFmZm9yZCBNZWRpY2FsIFRlY2hub2xvZ2llcyBQcml2YXRlIExpbWl0ZWQiLCJqdGkiOiI5NTQzMmY3Ni1lNWM2LTQwMjYtYjQzNC1iZGE2Nzg0MDEwYjgiLCJsb2NhbGUiOiJlbi1JTiIsIm5hbWUiOiJzYW5qamlpZXYgcyIsInN1YiI6IjU4NWU4MGRiLWZiYzUtNDk4My1hNGE1LWYxNjU0YzNkZDY0YiJ9LCJlbWFpbCI6InNhbmpqaWlldjAwNUBnbWFpbC5jb20iLCJuYW1lIjoic2FuamppaWV2IHMiLCJyb2xsTm8iOiJjYi5zYy51NGNzZTIzNTUzIiwiYWNjZXNzQ29kZSI6IlBUQk1tUSIsImNsaWVudElEIjoiNTg1ZTgwZGItZmJjNS00OTgzLWE0YTUtZjE2NTRjM2RkNjRiIiwiY2xpZW50U2VjcmV0IjoicEpFQU51em1od1BaeHBQRyJ9.WyTv9ak850ARDMAZvJogsgxrrvLB7fp3VqicWq_mD5A'
                }
            });
            if (!response.ok) {
                throw new Error(`API returned HTTP status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.vehicles) {
                return data.vehicles.map(t => new Task(t.TaskID, t.Duration, t.Impact));
            } else if (Array.isArray(data)) {
                
                return data.map(t => new Task(t.TaskID || t.id, t.Duration || t.duration, t.Impact || t.impact));
            }
            
            console.error('--- UNEXPECTED API RESPONSE ---', data);
            throw new Error("Invalid API response format: missing 'vehicles' array");
        } catch (error) {
            console.error('Failed to fetch vehicles API, using fallback:', error.message);
            return tasks.map(t => new Task(t.id, t.duration, t.impact));
        }
    }
}

module.exports = new ScheduleRepo();
