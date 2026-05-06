const Task = require('../models/Task');
const { Log } = require('../../logging_middleware');

const BUDGET_API_URL = 'http://20.207.122.201/evaluation-service/depots';
const TASKS_API_URL = 'http://20.207.122.201/evaluation-service/vehicles';

class ScheduleRepo {
    async fetchBudget() {
        Log('backend', 'info', 'db', 'Initiating external API call to fetch daily mechanic-hour budget');
        try {
            const response = await fetch(BUDGET_API_URL, {
                headers: {
                    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
                }
            });
            if (!response.ok) {
                Log('backend', 'error', 'db', `Critical budget API failure with HTTP Status Code: ${response.status}`);
                throw new Error(`API returned HTTP status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.depots) {
                Log('backend', 'debug', 'db', `Successfully fetched budget mapped directly from ${data.depots.length} depots`);
                return data.depots.reduce((total, depot) => total + depot.MechanicHours, 0);
            } else if (Array.isArray(data)) {
                Log('backend', 'debug', 'db', `Successfully aggregated budget from unmapped array structure`);
                return data.reduce((total, depot) => total + (depot.MechanicHours || 0), 0);
            }
            Log('backend', 'warn', 'db', 'Budget data structure unrecognized, defaulting to 40 mechanic-hours');
            return 40;
        } catch (error) {
            Log('backend', 'error', 'db', `Budget API Request threw exception: ${error.message}`);
            return 40; 
        }
    }

    async fetchTasks() {
        Log('backend', 'info', 'db', 'Initiating external API call to fetch vehicle tasks configuration');
        try {
            const response = await fetch(TASKS_API_URL, {
                headers: {
                    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
                }
            });
            if (!response.ok) {
                Log('backend', 'error', 'db', `Critical task API failure with HTTP Status Code: ${response.status}`);
                throw new Error(`API returned HTTP status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.vehicles) {
                Log('backend', 'debug', 'db', `Successfully fetched ${data.vehicles.length} vehicle configurations securely`);
                return data.vehicles.map(t => new Task(t.TaskID, t.Duration, t.Impact));
            } else if (Array.isArray(data)) {
                Log('backend', 'debug', 'db', `Tasks derived dynamically via array evaluation mapping strategy`);
                return data.map(t => new Task(t.TaskID || t.id, t.Duration || t.duration, t.Impact || t.impact));
            }
            
            Log('backend', 'error', 'db', `Invalid API response format: missing "vehicles" array configuration`);
            throw new Error("Invalid API response format: missing 'vehicles' array");
        } catch (error) {
            Log('backend', 'error', 'db', `Vehicle Tasks API Request threw exception: ${error.message}, applying dummy fallback strategy`);
            const fallbackTasks = [
                { id: 'Vehicle_A', duration: 10, impact: 60 },
                { id: 'Vehicle_B', duration: 20, impact: 100 },
                { id: 'Vehicle_C', duration: 30, impact: 120 },
                { id: 'Vehicle_D', duration: 15, impact: 70 },
                { id: 'Vehicle_E', duration: 5, impact: 30 }
            ];
            return fallbackTasks.map(t => new Task(t.id, t.duration, t.impact));
        }
    }
}

module.exports = new ScheduleRepo();
