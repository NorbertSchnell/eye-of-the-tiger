const audioFiles = [
  'eot-guitar-loop.wav',
  'eot-piano-reverse.wav',
  'eot-drum-loop.wav', // level 0
  'eot-guitar-melody-loop.wav', // level 1
  'eot-voice-loop.wav', // level 2
  'eot-guitar-crunch-loop.wav', // level 3
  'eot-tail.wav',
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

const numLevels = 4;
const pointsPerLevel = 20;
const maxPoints = (numLevels + 1) * pointsPerLevel;
const levelOffset = 2;
const hitOffset = numLevels + 3;
const badDuration = 0.05;
let startTime = 0;
let hitIndex = 0;
let points = 0;
let level = 0;

const loops = new Set();

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
    .then(() => start()) // close start screen (everything is ok)
    .catch((error) => setOverlayError(error)); // display error
});

function start() {
  hideOverlay();

  startTime = audioContext.currentTime;
  playSound(0, 0, 0, true);
  playSound(1, 0, 0, false);

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
  const fadeOutDuration = 0.050;

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

function decibelToLinar(val) {
  return Math.exp(0.11512925464970229 * val); // pow(10, val / 20)
}

/********************************************************************
 *  space bar
 */
function listenToSpaceBar() {
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      doHit();
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

let markerIndex = -1;

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
      doHit();
      lastHitTime = peakTime;
    }
  }

  lastFilteredRot = currentFilteredRot;
  lastDiffRot = currentDiffRot;
}

function doHit() {
  const time = audioContext.currentTime;
  const loopDuration = audioBuffers[0].duration;
  const loopTime = (time - startTime) % loopDuration;

  const tolerance = audioBuffers[0].duration / 64;
  const tolerantLoopTime = (loopTime + tolerance) % loopDuration;
  hitIndex = getCurrentOrPreviousIndex(hitMarkers, tolerantLoopTime, hitIndex);

  const diff = (hitMarkers[hitIndex] + tolerance - tolerantLoopTime);
  const good = (diff > -tolerance && diff < tolerance);
  const duration = good ? 0 : badDuration;
  playSound(hitIndex + hitOffset, 6, duration);

  points += good ? 1 : -1;
  displayPoints(points);

  if (hitIndex === 0 && points > pointsPerLevel * (level + 1) && level < numLevels) {
    playSound(levelOffset + level, 0, 0, true, loopTime);
    level++;
  } else if (level == 2 && hitIndex === 9 && points > pointsPerLevel * (level + 1) - 1 && level < numLevels) {
    playSound(levelOffset + level, 0, 0, true, loopTime);
    level++;
  } else if (level == numLevels && hitIndex === 0 && points >= maxPoints) {
    playSound(levelOffset + numLevels, 0, 0, false, loopTime);

    const fadeOutDuration = 0.050;

    // kill all loops
    for (let loop of loops) {
      const source = loop.source;
      const gain = loop.gain;
      gain.gain.setValueAtTime(loop.amp, time);
      gain.gain.linearRampToValueAtTime(0, time + fadeOutDuration);
      source.stop(time + fadeOutDuration);
    }
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

function displayPoints(points) {
  pointsDiv.innerHTML = points;
}