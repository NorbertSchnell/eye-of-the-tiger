const audioFiles = [
  'eot-guitar-loop.wav',
  'eot-drum-loop.wav',
  'eot-reverse.wav',
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

const numHits = 10;
let hitIndex = 0;
let hitOffset = 3;

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

  playSound(0, 0, true);
  playSound(2, 0, false);

  // playSound(1, 0, true);

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
      const request = new XMLHttpRequest();
      request.responseType = 'arraybuffer';
      request.open('GET', 'sounds/' + audioFiles[i]);
      request.addEventListener('load', () => {
        const ac = new AudioContext();
        ac.decodeAudioData(request.response, (buffer) => audioBuffers[i] = buffer);

        numBuffersReady++;
        if (numBuffersReady === audioFiles.length) {
          resolve();
        }
      });

      request.send();
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
function playSound(index, amplify = 0, loop = false) {
  const amp = decibelToLinar(amplify);

  const gain = audioContext.createGain();
  gain.connect(audioContext.destination);
  gain.gain.value = amp;

  const source = audioContext.createBufferSource();
  source.connect(gain);
  source.buffer = audioBuffers[index];
  source.loop = loop;
  source.start(audioContext.currentTime);
}

function playNextHit() {
  playSound(hitIndex + hitOffset, 6);
  hitIndex = (hitIndex + 1) % numHits;
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
      playNextHit();
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

const rotationRateThreshold = 10;
let filterCoeff = null;
let lastFilteredRot = 0;
let lastDiffRot = null;

function onDeviceMotion(e) {
  if (dataStreamTimeout !== null && dataStreamResolve !== null) {
    dataStreamResolve();
    clearTimeout(dataStreamTimeout);
  }

  const rotationRate = e.rotationRate;
  const rotMag = Math.sqrt(rotationRate.alpha * rotationRate.alpha + rotationRate.beta * rotationRate.beta + rotationRate.gamma * rotationRate.gamma);
  const currentFilteredRot = filterCoeff * lastFilteredRot + (1 - filterCoeff) * rotMag;
  const lastDiffRot = currentFilteredRot - lastFilteredRot;

  // init filterCoeff with sensor interval
  if (filterCoeff === null) {
    filterCoeff = Math.exp(-2.0 * Math.PI * e.interval / 1);
  }

  // init lastDiffRot
  if (lastDiffRot === null) {
    lastDiffRot = currentDiffRot;
  }

  if (lastDiffRot >= 0 && currentDiffRot < 0) {
    const peakRot = currentFilteredRot;

    if (peakRot >= rotationRateThreshold) {
      playNextHit();
    }
  }
}
