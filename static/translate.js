// Constants and state
const apiBaseUrl = '';
const FRAME_INTERVAL = 150; // ms between frame captures
const CONFIDENCE_THRESHOLD = 0.6; // minimum confidence to display
let isCapturing = false;
let videoElement = null;
let stream = null;
let isVideoPlaying = false;
let lastPredictionTime = 0;
let currentSentence = "";
let lastGesture = null;
let consecutiveGestureCount = 0;
let canvasElement = null;
let canvasContext = null;

// Hand landmark connections - each pair represents a connection between points
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],           // index finger
    [0, 9], [9, 10], [10, 11], [11, 12],      // middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],    // ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],    // pinky
    [5, 9], [9, 13], [13, 17],                // palm connections
    [0, 17]                                   // base palm connection
];

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing ASL translator');
    
    // Initialize UI elements
    videoElement = document.getElementById('camera-stream');
    canvasElement = document.getElementById('hand-canvas');
    const startButton = document.getElementById('start-camera');
    const stopButton = document.getElementById('stop-camera');
    const translationOutput = document.getElementById('translation-output');
    const permissionHelpBox = document.getElementById('permission-help');
    const sentenceContainer = document.getElementById('sentence-container');
    const sentenceOutput = document.getElementById('sentence-output');
    const clearSentenceButton = document.getElementById('clear-sentence');
    
    console.log('Video element found:', videoElement !== null);
    console.log('Canvas element found:', canvasElement !== null);
    console.log('Start button found:', startButton !== null);
    
    // Initialize canvas context if canvas exists
    if (canvasElement) {
        canvasContext = canvasElement.getContext('2d');
    }
    
    // Hide permission help initially
    if (permissionHelpBox) {
        permissionHelpBox.style.display = 'none';
    }
    
    // Setup clear sentence button
    if (clearSentenceButton) {
        clearSentenceButton.addEventListener('click', clearSentence);
    }
    
    // Initialize sentence container
    loadCurrentSentence();
    
    // Setup camera buttons
    if (startButton) {
        console.log('Adding event listener to start camera button');
        startButton.addEventListener('click', startCamera);
    }
    
    if (stopButton) {
        console.log('Adding event listener to stop camera button');
        stopButton.addEventListener('click', stopCamera);
    }
});

// Load the current sentence from the server
function loadCurrentSentence() {
    fetch('/api/sentence/get')
        .then(response => response.json())
        .then(data => {
            updateSentenceDisplay(data.sentence);
        })
        .catch(error => {
            console.error('Error fetching sentence:', error);
        });
}

// Update the sentence display
function updateSentenceDisplay(sentence) {
    currentSentence = sentence;
    const sentenceOutput = document.getElementById('sentence-output');
    if (sentenceOutput) {
        sentenceOutput.textContent = sentence || "Your sentence will appear here";
        
        // Animate the update
        sentenceOutput.classList.add('updated');
        setTimeout(() => {
            sentenceOutput.classList.remove('updated');
        }, 300);
    }
}

// Clear the current sentence
function clearSentence() {
    fetch('/api/sentence/clear', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        updateSentenceDisplay(data.sentence);
        
        // Show feedback
        const translationOutput = document.getElementById('translation-output');
        if (translationOutput) {
            translationOutput.innerHTML = '<span class="gesture-feedback">Sentence cleared</span>';
        }
    })
    .catch(error => {
        console.error('Error clearing sentence:', error);
    });
}

// Add gesture to sentence
function addGestureToSentence(gesture) {
    if (!gesture || gesture === 'No hand detected' || gesture === 'Error') {
        return;
    }
    
    fetch('/api/sentence/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            gesture: gesture,
            last_gesture: lastGesture
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.added) {
            updateSentenceDisplay(data.sentence);
        }
    })
    .catch(error => {
        console.error('Error adding to sentence:', error);
    });
}

// Start the camera and video feed
async function startCamera() {
    console.log('Starting camera...');
    
    if (!videoElement) {
        videoElement = document.getElementById('camera-stream');
    }
    
    const translationOutput = document.getElementById('translation-output');
    const permissionHelpBox = document.getElementById('permission-help');
    const startButton = document.getElementById('start-camera');
    const stopButton = document.getElementById('stop-camera');
    
    if (!videoElement) {
        console.error('Camera video element not found');
        if (translationOutput) {
            translationOutput.innerHTML = '<span class="error">Camera element not found on page</span>';
        }
        return;
    }
    
    try {
        // Request camera access
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            } 
        });
        
        // Hide permission help if it was shown
        if (permissionHelpBox) {
            permissionHelpBox.style.display = 'none';
        }
        
        // Connect stream to video element
        videoElement.srcObject = stream;
        videoElement.play();
        
        // Update UI
        if (startButton) startButton.style.display = 'none';
        if (stopButton) stopButton.style.display = 'inline-block';
        
        // Show sentence container
        const sentenceContainer = document.getElementById('sentence-container');
        if (sentenceContainer) sentenceContainer.style.display = 'block';
        
        if (translationOutput) {
            translationOutput.innerHTML = '<span class="waiting">Camera started. Waiting for hand gestures...</span>';
        }
        
        isVideoPlaying = true;
        startTranslation();
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        
        if (translationOutput) {
            if (error.name === 'NotAllowedError') {
                translationOutput.innerHTML = '<span class="error">Camera access denied. Please grant permission and try again.</span>';
                // Show the help box with instructions
                if (permissionHelpBox) {
                    permissionHelpBox.style.display = 'block';
                }
            } else {
                translationOutput.innerHTML = `<span class="error">Camera error: ${error.message}</span>`;
            }
        }
    }
}

// Stop the camera
function stopCamera() {
    console.log('Stopping camera...');
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    if (!videoElement) {
        videoElement = document.getElementById('camera-stream');
    }
    
    if (videoElement) {
        videoElement.srcObject = null;
    }
    
    // Update UI
    const startButton = document.getElementById('start-camera');
    const stopButton = document.getElementById('stop-camera');
    
    if (startButton) startButton.style.display = 'inline-block';
    if (stopButton) stopButton.style.display = 'none';
    
    const translationOutput = document.getElementById('translation-output');
    if (translationOutput) {
        translationOutput.innerHTML = '<span>Start the camera to begin translation</span>';
    }
    
    isVideoPlaying = false;
    stopTranslation();
    
    // Clear the canvas
    clearHandCanvas();
}

// Start translation process
function startTranslation() {
    if (!isVideoPlaying) return;
    
    console.log('Starting translation process');
    captureAndPredict();
    
    // Set interval to capture frames and make predictions
    captureInterval = setInterval(captureAndPredict, FRAME_INTERVAL);
}

// Stop translation process
function stopTranslation() {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
}

// Capture frame and make prediction
function captureAndPredict() {
    if (!videoElement || !isVideoPlaying) return;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // Update the size of the hand canvas if needed
    if (canvasElement) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }
    
    // Check if video dimensions are valid
    if (canvas.width === 0 || canvas.height === 0) {
        console.error('Invalid video dimensions');
        return;
    }
    
    // Draw the current frame to the canvas
    try {
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 format suitable for the API
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Send to prediction API
        fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                frame: imageData, // Changed from 'image' to 'frame' to match server expectation
                timestamp: Date.now()
            })
        })
        .then(response => response.json())
        .then(handlePredictionResponse)
        .catch(error => {
            console.error('Error during prediction:', error);
            const translationOutput = document.getElementById('translation-output');
            if (translationOutput) {
                translationOutput.innerHTML = `<span class="error">Error: ${error.message}</span>`;
            }
            
            // Clear the hand canvas on error
            clearHandCanvas();
        });
    } catch (error) {
        console.error('Error capturing frame:', error);
        const translationOutput = document.getElementById('translation-output');
        if (translationOutput) {
            translationOutput.innerHTML = '<span class="error">Error capturing camera frame</span>';
        }
        
        // Clear the hand canvas on error
        clearHandCanvas();
    }
}

// Function to clear the hand canvas
function clearHandCanvas() {
    if (canvasElement && canvasContext) {
        canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
}

// Function to draw hand landmarks on canvas
function drawHandLandmarks(landmarks) {
    if (!canvasElement || !canvasContext || !landmarks || landmarks.length === 0) {
        return;
    }
    
    // Clear previous drawing
    canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    const width = canvasElement.width;
    const height = canvasElement.height;
    
    // Draw connections first (lines)
    canvasContext.lineWidth = 4;
    canvasContext.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    canvasContext.beginPath();
    
    HAND_CONNECTIONS.forEach(([i, j]) => {
        if (i < landmarks.length && j < landmarks.length) {
            const start = landmarks[i];
            const end = landmarks[j];
            
            canvasContext.moveTo(start.x * width, start.y * height);
            canvasContext.lineTo(end.x * width, end.y * height);
        }
    });
    
    canvasContext.stroke();
    
    // Draw landmarks (points)
    landmarks.forEach((landmark, index) => {
        // Different colors for different parts of the hand
        if (index === 0) {
            // Wrist point
            canvasContext.fillStyle = 'rgba(255, 0, 0, 0.8)'; // Red
            canvasContext.beginPath();
            canvasContext.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
            canvasContext.fill();
        } else if (index >= 1 && index <= 4) {
            // Thumb
            canvasContext.fillStyle = 'rgba(255, 165, 0, 0.8)'; // Orange
            canvasContext.beginPath();
            canvasContext.arc(landmark.x * width, landmark.y * height, 5, 0, 2 * Math.PI);
            canvasContext.fill();
        } else {
            // Other fingers
            canvasContext.fillStyle = 'rgba(255, 255, 255, 0.8)'; // White
            canvasContext.beginPath();
            canvasContext.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);
            canvasContext.fill();
        }
    });
}

// Handle prediction response
function handlePredictionResponse(data) {
    const translationOutput = document.getElementById('translation-output');
    const confidenceBar = document.querySelector('.confidence-bar');
    
    if (!translationOutput) return;
    
    // Draw hand landmarks if available
    if (data.landmarks && data.landmarks.length > 0) {
        drawHandLandmarks(data.landmarks);
    } else {
        clearHandCanvas();
    }
    
    if (data.error) {
        translationOutput.innerHTML = `<span class="error">${data.error}</span>`;
        return;
    }
    
    if (!data.gesture || data.gesture === 'No hand detected') {
        translationOutput.innerHTML = `<span class="no-gesture">No hand detected</span>`;
        if (confidenceBar) confidenceBar.style.width = '0%';
        consecutiveGestureCount = 0;
        return;
    }
    
    // Update confidence bar
    if (confidenceBar) {
        const confidencePercent = Math.round(data.confidence * 100);
        confidenceBar.style.width = `${confidencePercent}%`;
    }
    
    // Check if we're seeing the same gesture consecutively
    if (data.gesture === lastGesture) {
        consecutiveGestureCount++;
        
        // Add to sentence if we've seen the same gesture several times (gesture is stable)
        if (consecutiveGestureCount === 5) {
            addGestureToSentence(data.gesture);
        }
    } else {
        consecutiveGestureCount = 1;
        lastGesture = data.gesture;
    }
    
    // Display the prediction
    let html = `<div class="prediction ${data.confidence < 0.7 ? 'low-confidence' : ''}">
        <span class="gesture">${data.gesture}</span>
        <div class="details">
            <span class="confidence">Confidence: ${Math.round(data.confidence * 100)}%</span>
            <span class="quality">Quality: ${Math.round(data.quality_score * 100)}%</span>
        </div>`;
    
    // Add waiting confirmation for stable gestures
    if (consecutiveGestureCount > 1 && consecutiveGestureCount < 5) {
        html += `<div class="waiting-confirmation">
            Hold position to confirm (${consecutiveGestureCount}/5)
        </div>`;
    }
    
    // Add similar gestures if available
    if (data.similar_gestures && data.similar_gestures.length > 0) {
        html += `<div class="similar">
            Similar: ${data.similar_gestures.join(', ')}
        </div>`;
    }
    
    html += `</div>`;
    translationOutput.innerHTML = html;
}