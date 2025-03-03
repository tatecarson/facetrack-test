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
    let poseNetModel = null;
    
    // Initialize PoseNet
    async function initPoseNet() {
        statusDiv.textContent = 'Loading body tracking model...';
        
        try {
            // Load the PoseNet model
            poseNetModel = await posenet.load({
                architecture: 'MobileNetV1',
                outputStride: 16,
                inputResolution: { width: 640, height: 480 },
                multiplier: 0.75
            });
            
            statusDiv.textContent = 'Body tracking model loaded successfully!';
            startBtn.disabled = false;
        } catch (error) {
            statusDiv.textContent = 'Failed to load body tracking model: ' + error.message;
            console.error('Error loading PoseNet:', error);
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
    
    // Detect body pose in the current video frame
    async function detectBody() {
        if (!isTracking || !poseNetModel) return;
        
        try {
            // Use PoseNet to detect the body pose
            const pose = await poseNetModel.estimateSinglePose(video);
            
            // Clear the overlay
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            
            if (pose && pose.keypoints && pose.keypoints.length > 0) {
                // Draw keypoints
                drawBodyKeypoints(pose.keypoints);
                
                // Create normalized data - normalize all keypoints to 0-1 range
                const normalizedKeypoints = pose.keypoints.map(keypoint => {
                    return {
                        part: keypoint.part,
                        score: keypoint.score,
                        x: keypoint.position.x / video.width,
                        y: keypoint.position.y / video.height
                    };
                });
                
                // Send body tracking data to the server
                socket.emit('bodyData', { keypoints: normalizedKeypoints });
                
                // Update the metrics display
                updateBodyMetricsDisplay(normalizedKeypoints);
                
                statusDiv.textContent = 'Tracking body...';
            } else {
                statusDiv.textContent = 'No body pose detected';
                metricsDiv.innerHTML = '';
            }
        } catch (error) {
            console.error('Error during body detection:', error);
            statusDiv.textContent = 'Error during body detection: ' + error.message;
        }
    }
    
    // Draw the body keypoints on the canvas
    function drawBodyKeypoints(keypoints) {
        const minConfidence = 0.3;
        
        // Draw all the points
        keypoints.forEach(keypoint => {
            if (keypoint.score >= minConfidence) {
                const { x, y } = keypoint.position;
                drawPoint(x, y, 5, '#00ff00');
                
                // Add label for the keypoint
                ctx.fillStyle = 'white';
                ctx.font = '10px Arial';
                ctx.fillText(keypoint.part, x + 7, y);
            }
        });
        
        // Connect keypoints to form a skeleton
        drawSkeleton(keypoints);
    }
    
    // Draw lines between keypoints to form a skeleton
    function drawSkeleton(keypoints) {
        const minConfidence = 0.3;
        const adjacentKeyPoints = [
            ['nose', 'leftEye'], ['leftEye', 'leftEar'], ['nose', 'rightEye'],
            ['rightEye', 'rightEar'], ['leftShoulder', 'rightShoulder'],
            ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
            ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
            ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
            ['leftHip', 'rightHip'], ['leftHip', 'leftKnee'],
            ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'],
            ['rightKnee', 'rightAnkle']
        ];
        
        // Create lookup table for keypoints by part name
        const keypointMap = {};
        keypoints.forEach(keypoint => {
            keypointMap[keypoint.part] = keypoint;
        });
        
        // Draw lines between adjacent keypoints
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        
        adjacentKeyPoints.forEach(([partA, partB]) => {
            const keypointA = keypointMap[partA];
            const keypointB = keypointMap[partB];
            
            if (keypointA && keypointB && 
                keypointA.score >= minConfidence && 
                keypointB.score >= minConfidence) {
                
                ctx.beginPath();
                ctx.moveTo(keypointA.position.x, keypointA.position.y);
                ctx.lineTo(keypointB.position.x, keypointB.position.y);
                ctx.stroke();
            }
        });
    }
    
    // Update body metrics display
    function updateBodyMetricsDisplay(keypoints) {
        metricsDiv.innerHTML = '';
        
        keypoints.forEach(keypoint => {
            if (keypoint.score > 0.3) {
                const metricElement = document.createElement('div');
                metricElement.className = 'metric';
                metricElement.textContent = `${keypoint.part}: x=${keypoint.x.toFixed(3)}, y=${keypoint.y.toFixed(3)}`;
                metricsDiv.appendChild(metricElement);
            }
        });
    }
    
    // Draw a point on the canvas
    function drawPoint(x, y, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
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
            trackingInterval = setInterval(detectBody, 100);
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
    
    // Initialize PoseNet model
    initPoseNet();
});