require('dotenv').config();

const express = require('express');
const scheduleController = require('./controller/ScheduleController');
const { Log } = require('../logging_middleware');

const app = express();
app.use(express.json());


app.get('/schedule', (req, res) => scheduleController.generateSchedule(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    Log('backend', 'info', 'handler', `Vehicle Maintenance Scheduler Microservice is running on port ${PORT}`);
    console.log(`Access the schedule API at http://localhost:${PORT}/schedule`);
});