const Task = require('../models/Task');

const BUDGET_API_URL = 'http://20.207.122.201/evaluation-service/depots';
const TASKS_API_URL = 'http://20.207.122.201/evaluation-service/vehicles';

class ScheduleRepo {
    async fetchBudget() {
        try {
            const response = await fetch(BUDGET_API_URL);
            const data = await response.json();
            if (data && data.depots) {
                return data.depots.reduce((total, depot) => total + depot.MechanicHours, 0);
            }
            return 40;
        } catch (error) {
            console.error('Failed to fetch budget API, using fallback:', error.message);
            return 40; 
        }
    }

    async fetchTasks() {
        try {
            const response = await fetch(TASKS_API_URL);
            const data = await response.json();
            if (data && data.vehicles) {
                return data.vehicles.map(t => new Task(t.TaskID, t.Duration, t.Impact));
            }
            throw new Error("Invalid API response format: missing 'vehicles' array");
        } catch (error) {
            console.error('Failed to fetch vehicles API, using fallback:', error.message);
            const tasks = [
                { id: 'Vehicle_A', duration: 10, impact: 60 },
                { id: 'Vehicle_B', duration: 20, impact: 100 },
                { id: 'Vehicle_C', duration: 30, impact: 120 },
                { id: 'Vehicle_D', duration: 15, impact: 70 },
                { id: 'Vehicle_E', duration: 5, impact: 30 }
            ];
            return tasks.map(t => new Task(t.id, t.duration, t.impact));
        }
    }
}

module.exports = new ScheduleRepo();
