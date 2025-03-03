document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const statusDiv = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const metricsDiv = document.getElementById('metrics');
    const smoothingSlider = document.getElementById('smoothingSlider');
    const smoothingValue = document.getElementById('smoothingValue');
    
    // Initialize socket.io connection to the server
    const socket = io();
    
    // Tracking state
    let isTracking = false;
    let trackingInterval = null;
    let poseNetModel = null;
    
    // Smoothing buffer for body tracking parameters
    let dataBuffer = [];
    let smoothingFrames = 1; // Default: no smoothing
    
    // Body parts that PoseNet can detect (must match the server list)
    const BODY_PARTS = [
        'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
        'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
        'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
        'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'
    ];
    
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
                
                // Create a standardized keypoint data structure
                const currentData = standardizeKeypoints(pose.keypoints);
                
                // Add current data to the buffer
                dataBuffer.push(currentData);
                
                // Keep buffer size equal to smoothing frames
                if (dataBuffer.length > smoothingFrames) {
                    dataBuffer.shift();
                }
                
                // Apply smoothing by averaging values in the buffer
                const smoothedKeypoints = applySmoothing(dataBuffer);
                
                // Send body tracking data to the server
                socket.emit('bodyData', { keypoints: smoothedKeypoints });
                
                // Update the metrics display
                updateBodyMetricsDisplay(smoothedKeypoints);
                
                statusDiv.textContent = 'Tracking body...';
            } else {
                statusDiv.textContent = 'No body pose detected';
                metricsDiv.innerHTML = '';
                
                // If no body detected, send zeros to maintain consistent data flow
                const emptyData = BODY_PARTS.map(part => {
                    return { part, score: 0, x: 0, y: 0 };
                });
                socket.emit('bodyData', { keypoints: emptyData });
            }
        } catch (error) {
            console.error('Error during body detection:', error);
            statusDiv.textContent = 'Error during body detection: ' + error.message;
        }
    }
    
    // Standardize keypoints to ensure we have data for all expected body parts
    function standardizeKeypoints(detectedKeypoints) {
        // Create a map of detected keypoints
        const keypointMap = {};
        detectedKeypoints.forEach(keypoint => {
            keypointMap[keypoint.part] = keypoint;
        });
        
        // Create a standardized array with all body parts
        return BODY_PARTS.map(part => {
            if (keypointMap[part] && keypointMap[part].score > 0.2) {
                // Use detected keypoint if available and confidence is sufficient
                return {
                    part: part,
                    score: keypointMap[part].score,
                    x: keypointMap[part].position.x / video.width,
                    y: keypointMap[part].position.y / video.height
                };
            } else {
                // Otherwise use default values
                return {
                    part: part,
                    score: 0,
                    x: 0,
                    y: 0
                };
            }
        });
    }
    
    // Apply smoothing by averaging values in the buffer for body keypoints
    function applySmoothing(buffer) {
        if (buffer.length === 0) return [];
        if (buffer.length === 1) return buffer[0];
        
        // Create result array to hold the smoothed keypoints
        const result = [];
        
        // For each body part position
        for (let i = 0; i < BODY_PARTS.length; i++) {
            const part = BODY_PARTS[i];
            
            // Sum up the values for this body part across all frames in the buffer
            let sumX = 0;
            let sumY = 0;
            let sumScore = 0;
            let validFrames = 0;
            
            // Go through each frame in the buffer
            buffer.forEach(frame => {
                const keypoint = frame[i]; // The keypoint at this position should have the same part name
                if (keypoint && keypoint.part === part) {
                    sumX += keypoint.x || 0;
                    sumY += keypoint.y || 0;
                    sumScore += keypoint.score || 0;
                    validFrames++;
                }
            });
            
            // Calculate averages
            const avgX = validFrames > 0 ? sumX / validFrames : 0;
            const avgY = validFrames > 0 ? sumY / validFrames : 0;
            const avgScore = validFrames > 0 ? sumScore / validFrames : 0;
            
            // Add the smoothed keypoint to the result
            result.push({
                part: part,
                score: avgScore,
                x: avgX,
                y: avgY
            });
        }
        
        return result;
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
            if (keypoint.score > 0.2) { // Only show keypoints with reasonable confidence
                const metricElement = document.createElement('div');
                metricElement.className = 'metric';
                metricElement.textContent = `${keypoint.part}: x=${keypoint.x.toFixed(3)}, y=${keypoint.y.toFixed(3)}`;
                metricsDiv.appendChild(metricElement);
            } else {
                // Show missing keypoints in gray
                const metricElement = document.createElement('div');
                metricElement.className = 'metric';
                metricElement.style.opacity = "0.5";
                metricElement.textContent = `${keypoint.part}: not detected`;
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
            // Reset data buffer when starting tracking
            dataBuffer = [];
            
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
    
    // Initialize PoseNet model
    initPoseNet();
});