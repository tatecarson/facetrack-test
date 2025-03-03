const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('node-osc');
const path = require('path');

// Create an Express application
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Default port for the web server
const PORT = process.env.PORT || 3000;

// Wekinator OSC settings
const WEKINATOR_HOST = '127.0.0.1';
const WEKINATOR_PORT = 6448; // Default Wekinator input port
const oscClient = new Client(WEKINATOR_HOST, WEKINATOR_PORT);

// Body parts that PoseNet can detect (17 keypoints)
const BODY_PARTS = [
  'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
  'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'
];

// When a client connects via WebSocket
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Listen for face tracking data from the client
  socket.on('faceData', (data) => {
    console.log('Received face data');
    
    // Convert the face tracking data to an OSC message
    try {
      // Create OSC message with the face tracking parameters
      // Extract key properties and convert to array of values
      const oscValues = [
        parseFloat(data.x) || 0,
        parseFloat(data.y) || 0,
        parseFloat(data.width) || 0,
        parseFloat(data.height) || 0,
        parseFloat(data.leftEyeX) || 0,
        parseFloat(data.leftEyeY) || 0,
        parseFloat(data.rightEyeX) || 0,
        parseFloat(data.rightEyeY) || 0,
        parseFloat(data.noseX) || 0,
        parseFloat(data.noseY) || 0,
        parseFloat(data.mouthX) || 0,
        parseFloat(data.mouthY) || 0
      ];
      
      // Send the OSC message to Wekinator with dedicated address for face data
      oscClient.send('/wek/inputs/face', ...oscValues, (err) => {
        if (err) console.error('Error sending face OSC message:', err);
      });
    } catch (err) {
      console.error('Error creating face OSC message:', err);
    }
  });
  
  // Listen for body tracking data from the client
  socket.on('bodyData', (data) => {
    console.log('Received body data');
    
    try {
      // Create a fixed-size array of OSC values (34 values: 17 keypoints x 2 coordinates)
      const oscValues = [];
      
      // Create a map of keypoints for easier lookup
      const keypointMap = {};
      if (Array.isArray(data.keypoints)) {
        data.keypoints.forEach(keypoint => {
          keypointMap[keypoint.part] = keypoint;
        });
      }
      
      // Go through each known body part and add its coordinates
      // If the keypoint is missing, use 0 values
      BODY_PARTS.forEach(part => {
        const keypoint = keypointMap[part];
        if (keypoint && keypoint.score > 0.2) { // Only use the keypoint if confidence is sufficient
          oscValues.push(parseFloat(keypoint.x) || 0);
          oscValues.push(parseFloat(keypoint.y) || 0);
        } else {
          // If keypoint is missing or low confidence, push default values
          oscValues.push(0.0);
          oscValues.push(0.0);
        }
      });
      
      // Ensure we always have exactly 34 parameters for Wekinator (17 keypoints x 2 coords)
      if (oscValues.length === 34) {
        // Send the OSC message to Wekinator with dedicated address for body data
        oscClient.send('/wek/inputs/body', ...oscValues, (err) => {
          if (err) console.error('Error sending body OSC message:', err);
        });
      } else {
        console.error(`Invalid number of body parameters: ${oscValues.length}, expected 34`);
      }
    } catch (err) {
      console.error('Error creating body OSC message:', err);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Sending OSC messages to ${WEKINATOR_HOST}:${WEKINATOR_PORT}`);
});