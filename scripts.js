const audioFiles = [
  'eot-guitar-loop.wav', // layer 0 (rhythm guitar riff)
  'eot-piano-reverse.wav', // inverse piano sample
  'eot-drum-loop.wav', // 1st layer (drum loop)
  'eot-guitar-melody-loop.wav', // 2nd layer (melodic guitar )
  'eot-voice-loop.wav', // 3rd layer (voice)
  'eot-guitar-crunch-loop.wav', // 4th layer(heavy guitar)
  'eot-tail.wav', // final hit and vocals
  'eot-hit-01.wav',
  'eot-hit-02.wav',
  'eot-hit-03.wav',
  'eot-hit-04.wav',
  'eot-hit-05.wav',
  'eot-hit-06.wav',
  'eot-hit-07.wav',
  'eot-hit-08.wav',
  'eot-hit-09.wav',
  'eot-hit-10.wav',
];

const hitMarkers = [
  0.000000,
  1.119250,
  1.551396,
  1.946792,
  3.284271,
  3.718583,
  4.120479,
  5.503333,
  5.911708,
  6.311438
];

const layerLabels = [
  'Intro',
  'Drums',
  'Lead Guitar',
  'Vocals',
  'Heavy Guitar',
  'End',
];

const numHits = hitMarkers.length;
const numLayers = 4;
const pointsPerLayer = 2 * numHits;
const allPoints = (numLayers + 1) * pointsPerLayer;
const layerOffset = 2;
const hitOffset = numLayers + 3;
const badDuration = 0.050;
const fadeOutDuration = 0.050;
let startTime = 0;
let layerIndex = 0;
let hitIndex = 0;
let points = 0;

/********************************************************************
 * 
 *  start screen (overlay)
 * 
 */
const startScreenDiv = document.getElementById("start-screen");
const startScreenTextDiv = startScreenDiv.querySelector("p");

// open start screen
showOverlay("touch screen to start");
const buffersReady = loadAudioFiles();

// start after touch
startScreenDiv.addEventListener("click", () => {
  setOverlayText("checking for motion sensors and loading buffers...");

  const audioPromise = requestWebAudio();
  const deviceMotionPromise = requestDeviceMotion();

  Promise.all([audioPromise, deviceMotionPromise, buffersReady])
    .then(() => start()) // start application
    .catch((error) => setOverlayError(error)); // ... or display error
});

function start() {
  hideOverlay();

  startTime = audioContext.currentTime;
  playSound(0, 0, 0, true);
  playSound(1, 0, 0, false);

  displayPoints(0);
  displayLayer(0);

  listenToSpaceBar();

  if (deviceMotionAllowed) {
    listenToDeviceMotion();
  }
}

function showOverlay(text) {
  startScreenDiv.style.display = "block";

  if (text) {
    setOverlayText(text);
  }
}

function hideOverlay() {
  startScreenDiv.style.display = "none";
}

// display text on start screen
function setOverlayText(text) {
  startScreenTextDiv.classList.remove("error");
  startScreenTextDiv.innerHTML = text;
}

// display error message on start screen
function setOverlayError(text) {
  startScreenTextDiv.classList.add("error");
  startScreenTextDiv.innerHTML = text;
}

/********************************************************************
 * 
 *  web audio
 * 
 */
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();
const loops = new Set();
const audioBuffers = [];
let numBuffersReady = 0;

function loadAudioFiles() {
  return new Promise((resolve, reject) => {
    // load audio files into audio buffers
    for (let i = 0; i < audioFiles.length; i++) {
      fetch('sounds/' + audioFiles[i])
        .then(data => data.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(decodedAudio => {
          audioBuffers[i] = decodedAudio;
          numBuffersReady++;
          if (numBuffersReady === audioFiles.length) {
            resolve();
          }
        });
    }
  });
}

// get promise for web audio check and start
function requestWebAudio() {
  return new Promise((resolve, reject) => {
    if (AudioContext) {
      audioContext.resume()
        .then(() => resolve())
        .catch(() => reject());
    }
    else {
      reject("web audio not available");
    }
  });
}

// play sound by audio buffer index
function playSound(index, amplify = 0, duration = 0, loop = false, offset = 0) {
  const time = audioContext.currentTime;
  const amp = decibelToLinar(amplify);
  const buffer = audioBuffers[index];

  const gain = audioContext.createGain();
  gain.connect(audioContext.destination);
  gain.gain.value = amp;

  const source = audioContext.createBufferSource();
  source.connect(gain);
  source.buffer = buffer;;
  source.loop = loop;
  source.start(time, offset);

  if (duration > 0 && duration < (buffer.duration - fadeOutDuration)) {
    gain.gain.setValueAtTime(amp, time + duration);
    gain.gain.linearRampToValueAtTime(0, time + duration + fadeOutDuration);
    source.stop(time + duration + fadeOutDuration);
  }

  if (loop) {
    loops.add({ source, gain, amp });
  }
}

function stopAllLoops() {
  const time = audioContext.currentTime;

  for (let loop of loops) {
    const source = loop.source;
    const gain = loop.gain;
    gain.gain.setValueAtTime(loop.amp, time);
    gain.gain.linearRampToValueAtTime(0, time + fadeOutDuration);
    source.stop(time + fadeOutDuration);
  }
}



function decibelToLinar(val) {
  return Math.exp(0.11512925464970229 * val); // pow(10, val / 20)
}

/********************************************************************
 *  space bar
 */
function listenToSpaceBar() {
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      playHit();
    }
  })
}
/********************************************************************
 *  device motion
 */
let dataStreamTimeout = null;
let dataStreamResolve = null;

// get promise for device motion check and start
function requestDeviceMotion() {
  return new Promise((resolve, reject) => {
    if (DeviceMotionEvent) {
      dataStreamResolve = resolve;

      // set timeout in case that the API is ok, but no data is sent
      dataStreamTimeout = setTimeout(() => {
        dataStreamTimeout = null;
        setOverlayError("no motion sensor data streams");
        resolve();
      }, 1000);

      if (DeviceMotionEvent.requestPermission) {
        clearTimeout(dataStreamTimeout);

        // ask device motion permission on iOS
        DeviceMotionEvent.requestPermission()
          .then((response) => {
            if (response == "granted") {
              // got permission
              deviceMotionAllowed = true;
              resolve();
            } else {
              setOverlayError("no permission for device motion");
              resolve();
            }
          })
          .catch(console.error);
      } else {
        // no permission needed on non-iOS devices
        deviceMotionAllowed = true;
        resolve();
      }
    } else {
      reject("device motion not available");
    }
  });
}

function listenToDeviceMotion() {
  window.addEventListener("devicemotion", onDeviceMotion);
}

const rotationRateThreshold = 200;
let filterCoeff = null;
let lastFilteredRot = 0;
let lastDiffRot = null;
let lastHitTime = -Infinity;
let reachedEnd = false;

function onDeviceMotion(e) {
  if (dataStreamTimeout !== null && dataStreamResolve !== null) {
    dataStreamResolve();
    clearTimeout(dataStreamTimeout);
  }

  // init filterCoeff with sensor interval
  if (filterCoeff === null) {
    filterCoeff = Math.exp(-2.0 * Math.PI * e.interval / 1);
  }

  const rotationRate = e.rotationRate;
  const rotMag = Math.sqrt(rotationRate.alpha * rotationRate.alpha + rotationRate.beta * rotationRate.beta + rotationRate.gamma * rotationRate.gamma);
  const currentFilteredRot = filterCoeff * lastFilteredRot + (1 - filterCoeff) * rotMag;
  const currentDiffRot = currentFilteredRot - lastFilteredRot;

  // init lastDiffRot
  if (lastDiffRot === null) {
    lastDiffRot = currentDiffRot;
  }

  if (lastDiffRot >= 0 && currentDiffRot < 0) {
    const peakTime = 0.001 * performance.now();
    const peakRot = currentFilteredRot;

    const timeSinceLastHit = peakTime - lastHitTime;
    if (peakRot >= rotationRateThreshold && timeSinceLastHit > 0.25) {
      playHit();
      lastHitTime = peakTime;
    }
  }

  lastFilteredRot = currentFilteredRot;
  lastDiffRot = currentDiffRot;
}

/********************************************************************
 *  hits, points and layers
 */
function playHit() {
  if (!reachedEnd) {
    const time = audioContext.currentTime;
    const loopDuration = audioBuffers[0].duration;
    const loopTime = (time - startTime) % loopDuration;
    const tolerance = loopDuration / 64;

    // get hit corresponding to current loop time with tolerance
    const tolerantLoopTime = (loopTime + tolerance) % loopDuration;
    hitIndex = getCurrentOrPreviousIndex(hitMarkers, tolerantLoopTime, hitIndex);

    // calculate difference time to current or next hit and compare with tolerance
    const hitTime = hitMarkers[hitIndex];
    const diff = Math.abs(hitTime - (tolerantLoopTime - tolerance));
    const sucess = (diff < tolerance);

    // play hit (shortend when too far from current or next hitTime)
    const duration = sucess ? 0 : badDuration;
    playSound(hitIndex + hitOffset, 6, duration);

    // increase/decrease points
    points += sucess ? 1 : -1;
    displayPoints(points, sucess);

    // calculate points required for next layer
    let nextLayerPoints = pointsPerLayer * (layerIndex + 1);

    // launch layers loops (every 2 patterns = 20 hits)
    if (hitIndex === 0 && points > nextLayerPoints && layerIndex < numLayers) {
      // launch new layer on 1st hit (when enough points)
      playSound(layerOffset + layerIndex, 0, 0, true, loopTime);
      layerIndex++;
    } else if (layerIndex == 2 && hitIndex === 9 && points > nextLayerPoints - 1 && layerIndex < numLayers) {
      // exception: voice loop (3rd layer) starts on last bar (10th hit)
      playSound(layerOffset + layerIndex, 0, 0, true, loopTime);
      layerIndex++;
    } else if (layerIndex == numLayers && hitIndex === 0 && points > allPoints) {
      // play tail (final sample)
      playSound(layerOffset + numLayers, 0, 0, false, loopTime);
      stopAllLoops();
      reachedEnd = true;
      layerIndex++;
    }

    // display layer (blinking when next layer is pending)
    nextLayerPoints = pointsPerLayer * (layerIndex + 1);
    const nextLayerPending = (points >= nextLayerPoints);
    displayLayer(layerIndex, nextLayerPending);
  }
}

function getCurrentOrPreviousIndex(sortedArray, value, index = -1) {
  var size = sortedArray.length;

  if (size > 0) {
    var firstVal = sortedArray[0];
    var lastVal = sortedArray[size - 1];

    if (value < firstVal)
      index = -1;
    else if (value >= lastVal)
      index = size - 1;
    else {
      if (index < 0 || index >= size)
        index = Math.floor((size - 1) * (value - firstVal) / (lastVal - firstVal));

      while (sortedArray[index] > value)
        index--;

      while (sortedArray[index + 1] <= value)
        index++;
    }
  }

  return index;
}

const pointsDiv = document.getElementById("points");
const layerDiv = document.getElementById("layer");

function displayPoints(points, success = true) {
  pointsDiv.innerHTML = points;

  if (!success) {
    pointsDiv.classList.add('error');
  } else {
    pointsDiv.classList.remove('error');
  }
}

function displayLayer(layerIndex, pending = false) {
  const label = layerLabels[layerIndex];
  layerDiv.innerHTML = label;

  if (pending) {
    layerDiv.classList.add('pending');
  } else {
    layerDiv.classList.remove('pending');
  }
}
