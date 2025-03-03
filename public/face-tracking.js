document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const statusDiv = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const metricsDiv = document.getElementById('metrics');
    
    // Initialize socket.io connection to the server
    const socket = io();
    
    // Tracking state
    let isTracking = false;
    let trackingInterval = null;
    let faceModelsLoaded = false;
    
    // Initialize face-api.js
    async function initFaceAPI() {
        if (faceModelsLoaded) {
            startBtn.disabled = false;
            return;
        }
        
        statusDiv.textContent = 'Loading face detection models...';
        
        try {
            // Load the required models
            await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
            await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
            
            faceModelsLoaded = true;
            statusDiv.textContent = 'Face models loaded successfully!';
            startBtn.disabled = false;
        } catch (error) {
            statusDiv.textContent = 'Failed to load face models: ' + error.message;
            console.error('Error loading face models:', error);
        }
    }
    
    // Start the webcam
    async function startVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });
            
            video.srcObject = stream;
            statusDiv.textContent = 'Camera ready!';
            
            // Wait for the video to be ready
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    resolve();
                };
            });
        } catch (error) {
            statusDiv.textContent = 'Camera access denied or not available.';
            console.error('Error accessing camera:', error);
            throw error;
        }
    }
    
    // Detect faces in the current video frame
    async function detectFace() {
        if (!isTracking || !faceModelsLoaded) return;
        
        try {
            // Detect the face with landmarks
            const detections = await faceapi.detectAllFaces(
                video, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceLandmarks();
            
            // Clear the overlay
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            
            if (detections.length > 0) {
                // Use the first detected face
                const detection = detections[0];
                const box = detection.detection.box;
                const landmarks = detection.landmarks;
                
                // Draw the face box
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                
                // Extract key feature points
                const leftEye = landmarks.getLeftEye();
                const rightEye = landmarks.getRightEye();
                const nose = landmarks.getNose();
                const mouth = landmarks.getMouth();
                
                // Calculate centers of features
                const leftEyeCenter = calculateCenter(leftEye);
                const rightEyeCenter = calculateCenter(rightEye);
                const noseCenter = calculateCenter(nose);
                const mouthCenter = calculateCenter(mouth);
                
                // Draw key points
                drawPoint(leftEyeCenter.x, leftEyeCenter.y, 5, '#ff0000');
                drawPoint(rightEyeCenter.x, rightEyeCenter.y, 5, '#ff0000');
                drawPoint(noseCenter.x, noseCenter.y, 5, '#ff0000');
                drawPoint(mouthCenter.x, mouthCenter.y, 5, '#ff0000');
                
                // Normalize coordinates (0-1) relative to video dimensions
                const normalizedData = {
                    x: box.x / video.width,
                    y: box.y / video.height,
                    width: box.width / video.width,
                    height: box.height / video.height,
                    leftEyeX: leftEyeCenter.x / video.width,
                    leftEyeY: leftEyeCenter.y / video.height,
                    rightEyeX: rightEyeCenter.x / video.width,
                    rightEyeY: rightEyeCenter.y / video.height,
                    noseX: noseCenter.x / video.width,
                    noseY: noseCenter.y / video.height,
                    mouthX: mouthCenter.x / video.width,
                    mouthY: mouthCenter.y / video.height
                };
                
                // Send face data to the server via WebSocket
                socket.emit('faceData', normalizedData);
                
                // Update the metrics display
                updateMetricsDisplay(normalizedData);
                
                statusDiv.textContent = 'Tracking face...';
            } else {
                statusDiv.textContent = 'No face detected';
                metricsDiv.innerHTML = '';
            }
        } catch (error) {
            console.error('Error during face detection:', error);
            statusDiv.textContent = 'Error during face detection';
        }
    }
    
    // Calculate the center point of a set of landmarks points
    function calculateCenter(points) {
        const sumX = points.reduce((sum, point) => sum + point.x, 0);
        const sumY = points.reduce((sum, point) => sum + point.y, 0);
        return {
            x: sumX / points.length,
            y: sumY / points.length
        };
    }
    
    // Draw a point on the canvas
    function drawPoint(x, y, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Update the face metrics display with current face data
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
    
    // Start tracking button event
    startBtn.addEventListener('click', async () => {
        if (isTracking) return;
        
        try {
            await startVideo();
            isTracking = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            
            // Start the tracking loop
            trackingInterval = setInterval(detectFace, 100);
        } catch (error) {
            console.error('Failed to start tracking:', error);
        }
    });
    
    // Stop tracking button event
    stopBtn.addEventListener('click', () => {
        isTracking = false;
        clearInterval(trackingInterval);
        
        // Clear the video stream
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        
        // Clear the canvas
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        
        // Reset UI
        statusDiv.textContent = 'Tracking stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        metricsDiv.innerHTML = '';
    });
    
    // Socket connection event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    // Initialize face models
    initFaceAPI();
});