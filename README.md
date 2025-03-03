# Face and Body Tracking OSC for Wekinator

A web-based tracking application that sends OSC data to Wekinator for sound control. This application uses your webcam to track facial features or body pose and sends the tracking data as OSC messages to Wekinator, which can then be used to control sound parameters.

## Features

- Real-time face tracking using face-api.js
- Real-time body pose tracking using PoseNet
- Switch between face and body tracking modes
- Detects and tracks face position, eyes, nose, and mouth
- Detects and tracks body keypoints (17 points including shoulders, elbows, wrists, hips, knees, and ankles)
- Streams tracking data to Wekinator via OSC with dedicated OSC addresses for each tracking type
- Visual feedback of tracked features
- Real-time display of tracking metrics

## Prerequisites

To use this application, you'll need:

- [Node.js](https://nodejs.org/) (version 14 or higher recommended)
- [Wekinator](http://www.wekinator.org/) (for receiving OSC messages and controlling sound)
- A webcam
- A modern web browser with camera permissions enabled (Chrome, Firefox, Safari, etc.)

## Installation

1. Clone or download this repository to your local machine

2. Open a terminal and navigate to the project directory:
   ```
   cd /path/to/facetrack-test
   ```

3. Install the required dependencies:
   ```
   npm install
   ```

## Running the Application

1. Start the application server:
   ```
   npm start
   ```

2. You should see output similar to:
   ```
   Server running on http://localhost:3000
   Sending OSC messages to 127.0.0.1:6448
   ```

3. Open a web browser and navigate to:
   ```
   http://localhost:3000
   ```

4. Allow camera access when prompted by your browser

5. Choose the tracking mode you want to use (Face or Body)

6. Click the "Start Tracking" button to begin tracking

## Configuring Wekinator

### For Face Tracking

1. Start Wekinator on the same computer

2. Create a new project with the following settings:
   - Input: **OSC** on port **6448**
   - OSC message address: **/wek/inputs/face** 
   - Number of inputs: **12** (face tracking parameters)
   - Choose your desired output type and count
   - Set up your desired output mapping for sound control

3. The 12 face tracking inputs represent:

| Index | Parameter | Description |
|-------|-----------|-------------|
| 0     | x         | Face x position (normalized 0-1) |
| 1     | y         | Face y position (normalized 0-1) |
| 2     | width     | Face width (normalized 0-1) |
| 3     | height    | Face height (normalized 0-1) |
| 4     | leftEyeX  | Left eye x position (normalized 0-1) |
| 5     | leftEyeY  | Left eye y position (normalized 0-1) |
| 6     | rightEyeX | Right eye x position (normalized 0-1) |
| 7     | rightEyeY | Right eye y position (normalized 0-1) |
| 8     | noseX     | Nose x position (normalized 0-1) |
| 9     | noseY     | Nose y position (normalized 0-1) |
| 10    | mouthX    | Mouth x position (normalized 0-1) |
| 11    | mouthY    | Mouth y position (normalized 0-1) |

### For Body Tracking

1. Start Wekinator on the same computer

2. Create a new project with the following settings:
   - Input: **OSC** on port **6448**
   - OSC message address: **/wek/inputs/body** 
   - Number of inputs: **34** (17 body keypoints, each with x and y coordinates)
   - Choose your desired output type and count
   - Set up your desired output mapping for sound control

3. The 34 body tracking inputs represent the x and y coordinates of 17 body keypoints:

| Keypoints |
|-----------|
| nose |
| leftEye |
| rightEye |
| leftEar |
| rightEar |
| leftShoulder |
| rightShoulder |
| leftElbow |
| rightElbow |
| leftWrist |
| rightWrist |
| leftHip |
| rightHip |
| leftKnee |
| rightKnee |
| leftAnkle |
| rightAnkle |

Each keypoint provides normalized x and y coordinates (0-1 range).

## Switching Between Face and Body Tracking

You can switch between face and body tracking modes through the interface:

1. Select either "Face Tracking" or "Body Tracking" option
2. Click the "Stop Tracking" button if tracking is already active
3. Click the "Start Tracking" button to begin tracking with the selected mode
4. Note: You'll need separate Wekinator projects for face and body tracking since they use different OSC addresses and have different numbers of inputs

## Using the Application with Wekinator

1. Run both this application and Wekinator on the same machine
2. Configure your Wekinator project based on your selected tracking mode (face or body)
3. Train Wekinator with different positions or movements
4. Map these inputs to sound parameters using Wekinator's machine learning capabilities

## Troubleshooting

- **Camera access denied**: Make sure your browser has permission to access your camera
- **No face/body detected**: Position yourself so your face or body is clearly visible to the camera
- **OSC connection issues**: Ensure Wekinator is running and configured to receive on port 6448
- **Model loading errors**: Check your internet connection, as the models are loaded from CDN
- **Performance issues with body tracking**: Body tracking is more computationally intensive than face tracking. Consider closing other applications to improve performance.

## Customization

You can customize the OSC settings by modifying the `server.js` file:

```javascript
// Wekinator OSC settings
const WEKINATOR_HOST = '127.0.0.1'; // Change if Wekinator is on another machine
const WEKINATOR_PORT = 6448; // Change if Wekinator uses a different port
```

## License

ISC

## Acknowledgments

- [face-api.js](https://github.com/justadudewhohacks/face-api.js/) for the face detection functionality
- [PoseNet](https://github.com/tensorflow/tfjs-models/tree/master/posenet) for the body pose estimation
- [Wekinator](http://www.wekinator.org/) for the machine learning and OSC handling
- [Socket.IO](https://socket.io/) for real-time communication
- [Node.js](https://nodejs.org/) for the server environment