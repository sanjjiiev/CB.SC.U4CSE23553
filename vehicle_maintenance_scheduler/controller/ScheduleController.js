const scheduleRepo = require('../repositories/ScheduleRepo');

class ScheduleController {
    async generateSchedule(req, res) {
        try {
            const [budget, tasks] = await Promise.all([
                scheduleRepo.fetchBudget(),
                scheduleRepo.fetchTasks()
            ]);

            const schedule = this.optimizeSchedule(tasks, budget);
            
            res.status(200).json({
                budget,
                totalTasksAvailable: tasks.length,
                maxImpact: schedule.maxImpact,
                scheduledTasks: schedule.scheduledTasks
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    optimizeSchedule(tasks, budget) {
        const n = tasks.length;
        const dp = Array.from({ length: n + 1 }, () => Array(budget + 1).fill(0));

        for (let i = 1; i <= n; i++) {
            const task = tasks[i - 1];
            const weight = Math.ceil(task.duration); 
            const value = task.impact;

            for (let w = 1; w <= budget; w++) {
                if (weight <= w) {
                    dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weight] + value);
                } else {
                    dp[i][w] = dp[i - 1][w];
                }
            }
        }

        let resVal = dp[n][budget];
        let w = budget;
        const selectedTasks = [];
        
        for (let i = n; i > 0 && resVal > 0; i--) {
            if (resVal !== dp[i - 1][w]) { const task = tasks[i - 1]; selectedTasks.push(task); resVal -= task.impact; w -= Math.ceil(task.duration); }
        }

        return { 
            maxImpact: dp[n][budget], 
            scheduledTasks: selectedTasks.reverse() 
        };
    }
}

module.exports = new ScheduleController();
