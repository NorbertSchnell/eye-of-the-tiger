const audioFiles = [
  'eot-guitar-loop.wav', // layer 0 (rhythm guitar riff)
  'eot-drum-loop.wav', // 1st layer (drum loop)
  'eot-guitar-melody-loop.wav', // 2nd layer (melodic guitar )
  'eot-voice-loop.wav', // 3rd layer (voice)
  'eot-guitar-crunch-loop.wav', // 4th layer(heavy guitar)
  'eot-tail.wav', // final hit and vocals
  'eot-piano-reverse.wav', // inverse piano sample
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

const loopMarkers = [
  0, // 1st hit
  1.1041328125, // 1st pattern
  1.5181826171875,
  1.932232421875,
  3.3123984375, // 2nd pattern
  3.7264482421875,
  4.140498046875,
  5.5206640625, // 3rd pattern
  5.9347138671875,
  6.348763671875,
  8.8330625 // loop duration
];

const hitBlocks = [];

const layerLabels = [
  'Intro',
  'Drums',
  'Lead Guitar',
  'Vocals',
  'Heavy Guitar',
  'End',
];

const numSoundsOtherThanHitsAndLayers = 3;
const numLayers = (layerLabels.length - 1);
const hitsPerLoop = (loopMarkers.length - 1);
const layerMultipliers = [20, 10, 5, 3, 1];
const minLoopsPerLayer = 1;
const maxLoopsPerLayer = (layerMultipliers.length - 1);
const pointsPerLayer = minLoopsPerLayer * hitsPerLoop;
const guitarRiffIndex = 0;
const voiceLayerIndex = 3;
const reversePianoIndex = 6;
const hitOffset = 4 + numSoundsOtherThanHitsAndLayers;
const badDuration = 0.050;
const fadeInDuration = 0.050;
const fadeOutDuration = 0.050;
const measuresPerLoop = 4;
const beatsPerMeasure = 4;
const beatsPerLoop = measuresPerLoop * beatsPerMeasure;
const tempIncertainty = 0.025;
const loopDuration = loopMarkers[hitsPerLoop];
const beatDuration = loopDuration / beatsPerLoop;
const sixteenthDuration = beatDuration / 4;
const hitTolerance = beatDuration / 4;
const hitReset = 0;
const hitPlayed = 1;
const hitGood = 2;
const hitBad = 3;
let startTime = null;
let countInCount = 0;
let countIn = null;
let loopIndex = 0;
let loopStartTime = null;
let currentHitIndex = -1; // increments just before first hit in loop
let layerIndex = 0; // intro
let layerLabel = 'Count In';
let hitInTime = false;
let goodHits = 0;
let badHits = 0;
let perfectLoop = true;
let successfulLoops = 0;
let loopsInLayer = 0;
let layerPoints = 0;
let totalPoints = null;
let nextLayerPending = false;

const hitList = [];
createHitBlocks();
resetHitList();

/********************************************************************
 * start screen (overlay)
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

  // init time and duration
  startTime = audioContext.currentTime;

  // console.log('hit tolerance: ', hitTolerance, 2 * hitTolerance);

  playSound(guitarRiffIndex, 0, 0, true);
  playSound(reversePianoIndex, 0, 0, false);

  listenToSpaceBar();
  listenToDeviceMotion();

  const firstTimeJustBeforeHit = startTime + loopDuration - hitTolerance;
  setTimeout(onTimeJustBeforeHit, 1000 * firstTimeJustBeforeHit);

  onCountIn();
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
 * web audio
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
function playSound(index, amplify = 0, duration = 0, loop = false, time = 0, offset = 0) {
  const amp = decibelToLinar(amplify);
  const buffer = audioBuffers[index];

  if (time === 0) {
    time = audioContext.currentTime;
  }

  const gain = audioContext.createGain();
  gain.connect(audioContext.destination);
  gain.gain.value = amp;

  const source = audioContext.createBufferSource();
  source.connect(gain);
  source.buffer = buffer;;
  source.loop = loop;
  source.start(time, offset);

  // apply fade in when sound starts with offset
  if (offset > 0) {
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(amp, time + fadeInDuration);
  }

  // apply fade our when sound stops before end
  if (!loop && duration > 0 && duration < (buffer.duration - fadeOutDuration)) {
    gain.gain.setValueAtTime(amp, time + duration);
    gain.gain.linearRampToValueAtTime(0, time + duration + fadeOutDuration);
    source.stop(time + duration + fadeOutDuration);
  }

  if (loop) {
    loops.add({ source, gain, amp });
  }
}

function stopAllLoops(time = 0) {
  if (time === 0) {
    time = audioContext.currentTime;
  }

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
 * space bar
 */
function listenToSpaceBar() {
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      onHit();
    }
  })
}
/********************************************************************
 * device motion
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
  if (deviceMotionAllowed) {
    window.addEventListener("devicemotion", onDeviceMotion);
  }
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
    if (peakRot >= rotationRateThreshold && timeSinceLastHit > 2 * hitTolerance) {
      onHit();
      lastHitTime = peakTime;
    }
  }

  lastFilteredRot = currentFilteredRot;
  lastDiffRot = currentDiffRot;
}

/********************************************************************
 * beats, hits and layers
 */
const flashDiv = document.getElementById("flash");

function onTimeJustBeforeHit() {
  hitInTime = true;

  // console.log(`_____________ (${layerIndex}, ${successfulLoops}, ${currentHitIndex})`);

  // advance to next hit
  currentHitIndex = (currentHitIndex + 1) % hitsPerLoop;

  if (currentHitIndex === 0) {
    // next loop starting
    loopIndex++;
    loopStartTime = startTime + loopIndex * loopDuration;
    resetHitList();

    // init loop hit evaluation
    goodHits = 0;
    badHits = 0;
    perfectLoop = true;

    if (nextLayerPending) {
      // increment layer index
      layerIndex++;

      // increment total points
      const multiplier = (successfulLoops === 0) ? 1 : layerMultipliers[(loopsInLayer - 1)];
      totalPoints += multiplier * layerPoints;

      // init layer state
      successfulLoops = 0;
      loopsInLayer = 0;
      layerPoints = 0;
      nextLayerPending = false;
    }
  }

  const time = audioContext.currentTime;
  const currentHitMarker = loopMarkers[currentHitIndex];
  const nextHitMarker = loopMarkers[currentHitIndex + 1];

  const currentHitTime = loopStartTime + currentHitMarker;
  setTimeout(onHitTime, 1000 * (currentHitTime - time));

  if (nextHitMarker - currentHitMarker > 2 * hitTolerance) {
    const nextTimeJustAfterHit = loopStartTime + currentHitMarker + hitTolerance;
    setTimeout(onTimeJustAfterHit, 1000 * (nextTimeJustAfterHit - time));
    //setTimeout(onTimeJustAfterHit, 1000 * 2 * hitTolerance);
  }

  if (layerIndex < numLayers) {
    const nextTimeJustBeforeHit = loopStartTime + nextHitMarker - hitTolerance;
    setTimeout(onTimeJustBeforeHit, 1000 * (nextTimeJustBeforeHit - time));
  }

  updateDisplay();
}

function onHitTime() {
  if (currentHitIndex === 0) {
    if (totalPoints === null) {
      totalPoints = 0;
      countIn = null;
    }

    // update layer label
    layerLabel = layerLabels[layerIndex];

    if (layerIndex === numLayers) {
      // this is the end
      reachedEnd = true;
    }
  }

  flashDisplay(currentHitIndex === (hitsPerLoop - 1));

  if (!reachedEnd && hitList[currentHitIndex] < hitPlayed) {
    hitList[currentHitIndex] = hitPlayed;
  }

  updateDisplay();
}

function onTimeJustAfterHit() {
  hitInTime = false;

  perfectLoop = (goodHits === (currentHitIndex + 1)) && (badHits === 0);

  if (currentHitIndex === hitsPerLoop - 1) {
    // loop successfully completed
    if (perfectLoop) {
      successfulLoops++;

      // init loop hit evaluation
      goodHits = 0;
      badHits = 0;
    }

    loopsInLayer++;
    perfectLoop = true;

    // advance to next layer
    if (successfulLoops === minLoopsPerLayer || loopsInLayer === maxLoopsPerLayer) {
      // set next layer pending
      nextLayerPending = true;

      // launch next layer loop
      const nextLayerIndex = layerIndex + 1;
      if (nextLayerIndex === voiceLayerIndex) {
        const time = audioContext.currentTime;
        const loopTime = (time - startTime) % loopDuration;
        playSound(voiceLayerIndex, 0, 0, true, 0, loopTime);
      } else {
        const nextLoopStartTime = loopStartTime + loopDuration;

        if (nextLayerIndex < numLayers) {
          // start next layer
          playSound(nextLayerIndex, 0, 0, true, nextLoopStartTime);
        } else if (nextLayerIndex === numLayers) {
          // start end (voice tail)
          playSound(numLayers, 6, 0, false, nextLoopStartTime);
          stopAllLoops(nextLoopStartTime);
        }
      }
    }
  }

  updateDisplay();

  // console.log(`^^^^^^^^^^^^^^ (${goodHits}, ${badHits})`);
}

function onHit() {
  if (loopIndex > 0 && layerIndex < numLayers) {
    if (hitInTime) {
      // increase good hits
      goodHits++;

      // increase layer points
      layerPoints++;

      // play good hit
      playSound(currentHitIndex + hitOffset, 6);

      // just one hit in time is good
      hitInTime = false;

      // mark good hit in "hit list"
      if (hitList[currentHitIndex] < hitGood) {
        hitList[currentHitIndex] = hitGood;
      }
    } else if (currentHitIndex !== (hitsPerLoop - 1)) {
      // increase bad hits
      badHits++;

      // decrease layer points
      layerPoints = Math.max(0, layerPoints - 1);

      // sure not a perfect loop
      perfectLoop = false;

      // play bad hit
      playSound(currentHitIndex + hitOffset, 6, badDuration);

      // mark bad hit in "hit list"
      hitList[currentHitIndex] = hitBad;
    }
  }

  updateDisplay();
}

function resetHitList() {
  for (let i = 0; i < hitsPerLoop; i++) {
    hitList[i] = hitReset;
  }
}

function displayHitList() {
  for (let i = 0; i < hitsPerLoop; i++) {
    const hit = hitList[i];
    const block = hitBlocks[i];

    block.className = 'hit-block';

    switch (hit) {
      case hitReset:
        block.classList.add('reset');
        break;
      case hitPlayed:
        block.classList.add('played');
        break;
      case hitGood:
        block.classList.add('good');
        break;
      case hitBad:
        block.classList.add('bad');
        break;
    }
  }
}

function printHitList() {
  let str = '';

  for (let i = 0; i <= currentHitIndex; i++) {
    const hit = hitList[i];

    switch (hit) {
      case hitReset:
        str += '.';
        break;
      case hitPlayed:
        str += '-';
        break;
      case hitGood:
        str += '*';
        break;
      case hitBad:
        str += 'x';
        break;
    }
  }

  console.log('hit list: ' + str);
}

function updateDisplay() {
  requestAnimationFrame(onAnimationFrame);
}

function onAnimationFrame() {
  displayCountIn();
  displayHitList();
  displayPoints();
  displayLayer();
  // printHitList();
}

function createHitBlocks() {
  const blockContainer = document.getElementById('block-container');

  for (let i = 0; i < hitsPerLoop; i++) {
    const hitTime = loopMarkers[i];
    const hitDuration = loopMarkers[i + 1] - loopMarkers[i];

    const block = document.createElement('div');
    block.classList.add('hit-block');
    block.style.bottom = `${100 * hitTime / loopDuration}%`;
    block.style.height = `${100 * hitDuration / loopDuration}%`;
    blockContainer.append(block);
    hitBlocks.push(block);

    console.log(`hit ${i + 1}: ${hitTime} (${hitDuration})`);
  }
}

const totalPointDiv = document.getElementById("total-points");
const layerPointDiv = document.getElementById("layer-points");

function displayPoints() {
  if (totalPoints !== null) {
    totalPointDiv.innerHTML = totalPoints;
  }

  if (loopIndex > 0 && !reachedEnd) {
    const multiplierIndex = loopsInLayer + !perfectLoop - nextLayerPending;
    const layerPointMultiplier = layerMultipliers[multiplierIndex];
    layerPointDiv.innerHTML = `${layerPointMultiplier} &times; ${layerPoints}`;
  } else {
    layerPointDiv.innerHTML = '';
  }

  if (nextLayerPending) {
    layerPointDiv.classList.add('blinking');
  } else {
    layerPointDiv.classList.remove('blinking');
  }
}

const layerLabelDiv = document.getElementById("layer-label");

function displayLayer() {
  layerLabelDiv.innerHTML = layerLabel;

  if (nextLayerPending) {
    layerLabelDiv.classList.add('blinking');
  } else {
    layerLabelDiv.classList.remove('blinking');
  }

  // console.log(`layer ${layerIndex}: ${layerLabel}`);
}

function flashDisplay(long = false) {
  flashDiv.classList.remove('short-flashing');
  flashDiv.classList.remove('long-flashing');
  flashDiv.offsetWidth;

  if (long) {
    flashDiv.classList.add('long-flashing');
  } else {
    flashDiv.classList.add('short-flashing');
  }
}

/********************************************************************
 * count in
 */
function onCountIn() {

  if (countInCount < 12) {
    if (countInCount % 2 === 0) {
      const count = Math.floor(countInCount / 2) % 4
      countIn = count + 1;
      flashDisplay(true);
    }
  } else {
    const count = countInCount % 4;
    countIn = count + 1;
    flashDisplay();
  }

  countInCount++;

  if (countInCount <= 16) {
    const time = audioContext.currentTime;
    const nextCountInTime = startTime + countInCount * beatDuration;
    setTimeout(onCountIn, 1000 * (nextCountInTime - time));
  }

  updateDisplay();
}

function displayCountIn() {
  if (countIn !== null) {
    totalPointDiv.innerHTML = countIn;
  }
}