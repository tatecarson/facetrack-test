document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const statusDiv = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const metricsDiv = document.getElementById('metrics');
    const smoothingSlider = document.getElementById('smoothingSlider');
    const smoothingValue = document.getElementById('smoothingValue');
    const deviceEl = document.querySelector('.device');
    
    // Initialize socket.io connection to the server
    const socket = io();
    
    // Tracking state
    let isTracking = false;
    let trackingInterval = null;
    
    // Smoothing buffer for orientation data
    let dataBuffer = [];
    let smoothingFrames = 1; // Default: no smoothing
    
    // Check if device orientation is available
    if (window.DeviceOrientationEvent) {
        statusDiv.textContent = 'Device orientation available!';
        startBtn.disabled = false;
    } else {
        statusDiv.textContent = 'Device orientation not available on this device';
        startBtn.disabled = true;
    }
    
    // Function to request device motion/orientation permission (needed for iOS 13+)
    async function requestOrientationPermission() {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                // This is iOS 13+ device
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    statusDiv.textContent = 'Permission granted!';
                    return true;
                } else {
                    statusDiv.textContent = 'Permission denied!';
                    return false;
                }
            } catch (error) {
                statusDiv.textContent = `Error requesting permission: ${error.message}`;
                console.error('Error requesting permission:', error);
                return false;
            }
        } else {
            // Non-iOS device that doesn't require permission
            return true;
        }
    }
    
    // Apply smoothing by averaging values in the buffer
    function applySmoothing(buffer) {
        if (buffer.length === 0) return {};
        if (buffer.length === 1) return buffer[0];
        
        // Create an object to hold the averaged values
        const result = {};
        
        // Get all property names from the first object
        const keys = Object.keys(buffer[0]);
        
        // Calculate average for each property
        keys.forEach(key => {
            const sum = buffer.reduce((total, item) => total + item[key], 0);
            result[key] = sum / buffer.length;
        });
        
        return result;
    }
    
    // Update the orientation metrics display
    function updateMetricsDisplay(data) {
        metricsDiv.innerHTML = '';
        
        // Create HTML elements for each metric
        for (const [key, value] of Object.entries(data)) {
            const metricElement = document.createElement('div');
            metricElement.className = 'metric';
            metricElement.textContent = `${key}: ${value.toFixed(3)}`;
            metricsDiv.appendChild(metricElement);
        }
    }
    
    // Update the 3D visualization of the device
    function updateOrientationVisual(alpha, beta, gamma) {
        deviceEl.style.transform = `translate(-50%, -50%) rotateZ(${alpha}deg) rotateX(${beta}deg) rotateY(${-gamma}deg)`;
    }
    
    // Process and send orientation data
    function processOrientationData(event) {
        if (!isTracking) return;
        
        try {
            // Extract orientation data and normalize
            const alpha = event.alpha; // Z-axis rotation [0, 360)
            const beta = event.beta;   // X-axis rotation [-180, 180)
            const gamma = event.gamma; // Y-axis rotation [-90, 90)
            
            // Normalize values to [0, 1] range for Wekinator
            const normalizedAlpha = alpha / 360;
            const normalizedBeta = (beta + 180) / 360;
            const normalizedGamma = (gamma + 90) / 180;
            
            const currentData = {
                alpha: normalizedAlpha,
                beta: normalizedBeta,
                gamma: normalizedGamma
            };
            
            // Visualize the device orientation
            updateOrientationVisual(alpha, beta, gamma);
            
            // Add current data to the buffer
            dataBuffer.push(currentData);
            
            // Keep buffer size equal to smoothing frames
            if (dataBuffer.length > smoothingFrames) {
                dataBuffer.shift();
            }
            
            // Apply smoothing by averaging values in the buffer
            const smoothedData = applySmoothing(dataBuffer);
            
            // Send orientation data to the server via WebSocket
            socket.emit('orientationData', smoothedData);
            
            // Update the metrics display
            updateMetricsDisplay(smoothedData);
        } catch (error) {
            console.error('Error processing orientation data:', error);
            statusDiv.textContent = 'Error processing orientation data';
        }
    }
    
    // Start tracking button event
    startBtn.addEventListener('click', async () => {
        if (isTracking) return;
        
        try {
            // Request permission if needed (iOS)
            const permissionGranted = await requestOrientationPermission();
            if (!permissionGranted) return;
            
            // Reset data buffer when starting tracking
            dataBuffer = [];
            
            // Start tracking
            isTracking = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            
            // Add the orientation event listener
            window.addEventListener('deviceorientation', processOrientationData);
            
            statusDiv.textContent = 'Tracking device orientation...';
        } catch (error) {
            console.error('Failed to start orientation tracking:', error);
            statusDiv.textContent = 'Failed to start tracking: ' + error.message;
        }
    });
    
    // Stop tracking button event
    stopBtn.addEventListener('click', () => {
        isTracking = false;
        
        // Remove the orientation event listener
        window.removeEventListener('deviceorientation', processOrientationData);
        
        // Reset UI
        statusDiv.textContent = 'Tracking stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        metricsDiv.innerHTML = '';
        
        // Reset device visualization
        deviceEl.style.transform = 'translate(-50%, -50%)';
    });
    
    // Smoothing slider change event
    smoothingSlider.addEventListener('input', () => {
        smoothingFrames = parseInt(smoothingSlider.value);
        smoothingValue.textContent = smoothingFrames;
        
        // Clear buffer when changing smoothing amount
        dataBuffer = [];
    });
    
    // Socket connection event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
});