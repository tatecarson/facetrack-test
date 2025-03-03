document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const statusDiv = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const metricsDiv = document.getElementById('metrics');
    const faceTrackingRadio = document.getElementById('faceTracking');
    const bodyTrackingRadio = document.getElementById('bodyTracking');
    
    // Initialize socket.io connection to the server
    const socket = io();
    
    // Tracking state
    let isTracking = false;
    let trackingInterval = null;
    let currentTrackingMode = 'face';
    
    // Model references
    let posenetModel = null;
    let faceModelsLoaded = false;
    let bodyModelsLoaded = false;
    
    // Initialize face-api.js
    async function initFaceAPI() {
        if (faceModelsLoaded) {
            if (currentTrackingMode === 'face') {
                startBtn.disabled = false;
            }
            return;
        }
        
        statusDiv.textContent = 'Loading face detection models...';
        
        try {
            // Load the required models
            await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
            await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
            
            faceModelsLoaded = true;
            statusDiv.textContent = 'Face models loaded successfully!';
            if (currentTrackingMode === 'face') {
                startBtn.disabled = false;
            }
        } catch (error) {
            statusDiv.textContent = 'Failed to load face models: ' + error.message;
            console.error('Error loading face models:', error);
        }
    }
    
    // Initialize PoseNet for body tracking - simplified since libraries are loaded directly
    function initBodyTracking() {
        if (bodyModelsLoaded && posenetModel) {
            startBtn.disabled = false;
            return;
        }
        
        // Check if PoseNet is available
        if (typeof posenet !== 'undefined') {
            statusDiv.textContent = 'Loading body tracking model...';
            startBtn.disabled = true;
            
            posenet.load({
                architecture: 'MobileNetV1',
                outputStride: 16,
                inputResolution: { width: 640, height: 480 },
                multiplier: 0.75
            }).then(net => {
                posenetModel = net;
                bodyModelsLoaded = true;
                statusDiv.textContent = 'Body tracking model loaded successfully!';
                if (currentTrackingMode === 'body') {
                    startBtn.disabled = false;
                }
            }).catch(error => {
                statusDiv.textContent = 'Failed to load body tracking model: ' + error.message;
                console.error('Error loading PoseNet:', error);
            });
        } else {
            statusDiv.textContent = 'PoseNet library not available. Check your internet connection.';
            console.error('PoseNet library not found');
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
        if (!isTracking || currentTrackingMode !== 'face' || !faceModelsLoaded) return;
        
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
    
    // Detect body pose in the current video frame
    async function detectBody() {
        if (!isTracking || currentTrackingMode !== 'body' || !posenetModel) return;
        
        try {
            // Use the PoseNet model directly without tf.tidy
            const pose = await posenetModel.estimateSinglePose(video);
            
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
    
    // Perform the appropriate detection based on the current tracking mode
    function performDetection() {
        if (currentTrackingMode === 'face') {
            detectFace();
        } else if (currentTrackingMode === 'body') {
            detectBody();
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
            trackingInterval = setInterval(performDetection, 100);
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
    
    // Handle tracking type change
    faceTrackingRadio.addEventListener('change', () => {
        if (faceTrackingRadio.checked) {
            // Stop tracking if it's currently active
            if (isTracking) {
                stopBtn.click();
            }
            
            currentTrackingMode = 'face';
            statusDiv.textContent = 'Face tracking mode selected';
            startBtn.disabled = !faceModelsLoaded;
            
            // Initialize face tracking if not already done
            if (!faceModelsLoaded) {
                initFaceAPI();
            }
        }
    });
    
    bodyTrackingRadio.addEventListener('change', () => {
        if (bodyTrackingRadio.checked) {
            // Stop tracking if it's currently active
            if (isTracking) {
                stopBtn.click();
            }
            
            currentTrackingMode = 'body';
            statusDiv.textContent = 'Body tracking mode selected';
            
            // Initialize body tracking
            if (!bodyModelsLoaded) {
                initBodyTracking();
            } else {
                startBtn.disabled = false;
            }
        }
    });
    
    // Socket connection event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    // Initialize face models by default
    initFaceAPI();
});