const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Agentic Node.js Frontend Service',
        environment: ENVIRONMENT,
        version: '1.0.0',
        fastapi_url: FASTAPI_URL
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        environment: ENVIRONMENT,
        service: 'nodejs',
        timestamp: new Date().toISOString()
    });
});

// Frontend dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Proxy endpoint to FastAPI status
app.get('/api/status', async (req, res) => {
    try {
        console.log(`Calling FastAPI at: ${FASTAPI_URL}/api/status`);
        const response = await axios.get(`${FASTAPI_URL}/api/status`, {
            timeout: 10000
        });
        
        res.json({
            frontend: {
                status: 'operational',
                environment: ENVIRONMENT,
                service: 'nodejs-frontend'
            },
            backend: response.data
        });
    } catch (error) {
        console.error('FastAPI connection failed:', error.message);
        res.status(500).json({
            frontend: {
                status: 'operational',
                environment: ENVIRONMENT,
                service: 'nodejs-frontend'
            },
            backend: {
                status: 'unreachable',
                error: error.message
            }
        });
    }
});

// Proxy endpoint to FastAPI database test
app.get('/api/db-test', async (req, res) => {
    try {
        console.log(`Calling FastAPI at: ${FASTAPI_URL}/api/db-test`);
        const response = await axios.get(`${FASTAPI_URL}/api/db-test`, {
            timeout: 15000
        });
        
        res.json({
            frontend_timestamp: new Date().toISOString(),
            environment: ENVIRONMENT,
            backend_response: response.data
        });
    } catch (error) {
        console.error('FastAPI database test failed:', error.message);
        res.status(500).json({
            frontend_timestamp: new Date().toISOString(),
            environment: ENVIRONMENT,
            error: 'Backend database test failed',
            details: error.message
        });
    }
});

// API endpoints info
app.get('/api', (req, res) => {
    res.json({
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET /dashboard',
            'GET /api',
            'GET /api/status',
            'GET /api/db-test'
        ],
        backend_url: FASTAPI_URL,
        environment: ENVIRONMENT
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        environment: ENVIRONMENT
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.url,
        environment: ENVIRONMENT
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js server running on port ${PORT}`);
    console.log(`Environment: ${ENVIRONMENT}`);
    console.log(`FastAPI URL: ${FASTAPI_URL}`);
});