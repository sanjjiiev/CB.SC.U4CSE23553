const LOG_API_URL = 'http://20.207.122.201/evaluation-service/logs';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

async function Log(stack, level, pkg, message) {
    
    const truncatedMessage = message.length > 48 ? message.substring(0, 45) + '...' : message;

    const payload = {
        stack: stack.toLowerCase(),
        level: level.toLowerCase(),
        package: pkg.toLowerCase(),
        message: truncatedMessage
    };

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${payload.stack.toUpperCase()}] [${payload.level.toUpperCase()}] [${payload.package}] - ${message}`);

    try {
        
        const response = await fetch(LOG_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AUTH_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[LOGGER FAILURE] The Logging API rejected the request with HTTP Status: ${response.status}. Details: ${errorBody}`);
        }
    } catch (error) {
        console.error(`[LOGGER FAILURE] Could not reach the Logging API. Error: ${error.message}`);
    }
}

module.exports = { Log };