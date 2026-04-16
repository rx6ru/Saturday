let vapi = null;
let config = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const response = await fetch('/api/config');
    config = await response.json();

    if (!config.vapiPublicKey || !config.assistantId) {
      showError('Configuration incomplete. Run saturday serve again.');
      return;
    }

    vapi = new Vapi(config.vapiPublicKey);
    setupVapiEvents();
    setupUIEvents();
    await fetchSyncStatus();

    console.log('Saturday initialized');
  } catch (error) {
    showError('Initialization failed: ' + error.message);
  }
}

function setupVapiEvents() {
  vapi.on('speech-start', () => {
    document.getElementById('orb').classList.add('speaking');
    document.getElementById('orb').classList.remove('listening');
    document.getElementById('status').textContent = 'AI speaking...';
  });

  vapi.on('speech-end', () => {
    document.getElementById('orb').classList.remove('speaking');
    document.getElementById('status').textContent = 'Click to talk';
  });

  vapi.on('call-start', () => {
    document.getElementById('status').textContent = 'Listening...';
    document.getElementById('talkBtn').classList.add('active');
    document.getElementById('talkBtn').textContent = 'Stop';
  });

  vapi.on('call-end', () => {
    document.getElementById('orb').classList.remove('speaking', 'listening');
    document.getElementById('status').textContent = 'Click to start';
    document.getElementById('talkBtn').classList.remove('active');
    document.getElementById('talkBtn').textContent = 'Talk';
  });

  vapi.on('volume-level', (volume) => {
    const orb = document.getElementById('orb');
    const intensity = Math.min(1, volume) * 30;
    orb.style.boxShadow = `
      0 0 ${60 + intensity}px rgba(74, 158, 255, ${0.5 + intensity/100}),
      inset 0 0 ${60 + intensity}px rgba(74, 158, 255, ${0.3 + intensity/100})
    `;
  });

  vapi.on('message', (message) => {
    if (message.type === 'transcript') {
      handleTranscript(message);
    }
  });

  vapi.on('error', (error) => {
    console.error('Vapi error:', error);
    showError(error?.error?.message || 'Voice error occurred');
  });
}

function handleTranscript(message) {
  const transcript = message.transcript;
  const role = message.role;
  const type = message.transcriptType;

  const transcriptDiv = document.getElementById('transcript');
  const empty = transcriptDiv.querySelector('.empty');
  if (empty) empty.remove();

  if (type === 'partial') {
    let existingMsg = transcriptDiv.querySelector(`.message.${role}.partial`);
    if (!existingMsg) {
      existingMsg = document.createElement('div');
      existingMsg.className = `message ${role} partial`;
      existingMsg.innerHTML = `<div class="role">${role === 'user' ? 'You' : 'AI'}:</div><div class="text"></div>`;
      transcriptDiv.appendChild(existingMsg);
    }
    existingMsg.querySelector('.text').textContent = transcript;
    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  } else if (type === 'final') {
    let existingMsg = transcriptDiv.querySelector(`.message.${role}.partial`);
    if (existingMsg) {
      existingMsg.classList.remove('partial');
      existingMsg.querySelector('.text').textContent = transcript;
    } else {
      const msg = document.createElement('div');
      msg.className = `message ${role}`;
      msg.innerHTML = `<div class="role">${role === 'user' ? 'You' : 'AI'}:</div><div class="text">${transcript}</div>`;
      transcriptDiv.appendChild(msg);
    }

    if (role === 'assistant') {
      extractSourcesFromText(transcript);
    }

    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  }
}

function extractSourcesFromText(text) {
  const filePattern = /(?:^|[^\w])([\w\/\-]+\.ts|[\w\/\-]+\.js|[\w\/\-]+\.tsx|[\w\/\-]+\.jsx|[\w\/\-]+\.py)/gi;
  const matches = text.match(filePattern);

  if (matches) {
    const uniqueFiles = [...new Set(matches.map(m => m.trim()))];
    updateSources(uniqueFiles.map(file => ({ file })));
  }
}

function updateSources(newSources) {
  const sourcesList = document.getElementById('sources');
  const empty = sourcesList.querySelector('.empty');
  if (empty) empty.remove();

  newSources.forEach(source => {
    const li = document.createElement('li');
    li.textContent = source.functionName ? `${source.file} (${source.functionName})` : source.file;
    sourcesList.appendChild(li);
  });
}

function setupUIEvents() {
  document.getElementById('talkBtn').addEventListener('click', () => {
    if (!vapi) return;

    const btn = document.getElementById('talkBtn');
    if (btn.classList.contains('active')) {
      vapi.stop();
    } else {
      document.getElementById('orb').classList.add('listening');
      document.getElementById('status').textContent = 'Listening...';
      vapi.start(config.assistantId);
    }
  });

  document.getElementById('syncBtn').addEventListener('click', async () => {
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchSyncStatus();
    } catch (error) {
      showError('Sync failed: ' + error.message);
    }

    btn.disabled = false;
    btn.textContent = 'Sync Now';
  });

  document.getElementById('sendBtn').addEventListener('click', sendTextMessage);
  document.getElementById('fallbackInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendTextMessage();
  });
}

function sendTextMessage() {
  const input = document.getElementById('fallbackInput');
  const text = input.value.trim();

  if (!text || !vapi) return;

  vapi.send({
    type: 'add-message',
    message: { role: 'user', content: text }
  });

  const transcriptDiv = document.getElementById('transcript');
  const empty = transcriptDiv.querySelector('.empty');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerHTML = `<div class="role">You:</div><div class="text">${text}</div>`;
  transcriptDiv.appendChild(msg);

  input.value = '';
}

async function fetchSyncStatus() {
  try {
    document.getElementById('syncStatus').textContent = 'Last synced: recently';
  } catch (error) {
    console.error('Failed to fetch sync status:', error);
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');

  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}
