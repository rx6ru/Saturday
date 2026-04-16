let vapi = null;
let config = null;
let currentSources = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const response = await fetch('/api/config');
    config = await response.json();

    updateAssistantSummary();

    if (!config.vapiPublicKey || !config.assistantId) {
      showError('Configuration incomplete. Run satur-day serve again.');
      return;
    }

    vapi = new Vapi(config.vapiPublicKey);
    setupVapiEvents();
    setupUIEvents();
    await fetchSyncStatus();
  } catch (error) {
    showError('Initialization failed: ' + error.message);
  }
}

function setupVapiEvents() {
  vapi.on('speech-start', () => {
    document.getElementById('orb').classList.add('speaking');
    document.getElementById('orb').classList.remove('listening');
    setSessionState('Speaking');
    document.getElementById('status').textContent = 'Assistant is speaking';
  });

  vapi.on('speech-end', () => {
    document.getElementById('orb').classList.remove('speaking');
    setSessionState('Connected');
    document.getElementById('status').textContent = 'Waiting for your next question';
  });

  vapi.on('call-start', () => {
    document.getElementById('orb').classList.add('listening');
    document.getElementById('status').textContent = 'Listening for your question';
    document.getElementById('talkBtn').classList.add('active');
    document.getElementById('talkBtn').textContent = 'Stop voice session';
    setSessionState('Listening');
  });

  vapi.on('call-end', () => {
    document.getElementById('orb').classList.remove('speaking', 'listening');
    document.getElementById('status').textContent = 'Ready to talk';
    document.getElementById('talkBtn').classList.remove('active');
    document.getElementById('talkBtn').textContent = 'Start voice session';
    setSessionState('Idle');
  });

  vapi.on('volume-level', (volume) => {
    const orb = document.getElementById('orb');
    const intensity = Math.min(1, volume) * 40;
    orb.style.boxShadow = `
      0 0 0 14px rgba(17, 93, 140, 0.08),
      0 32px ${70 + intensity}px rgba(17, 93, 140, ${0.24 + intensity / 200}),
      inset 0 0 ${32 + intensity}px rgba(255, 255, 255, 0.35)
    `;
  });

  vapi.on('message', (message) => {
    if (message.type === 'transcript') {
      handleTranscript(message);
    }
  });

  vapi.on('error', (error) => {
    setSessionState('Error');
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
      existingMsg.innerHTML = `<div class="role">${role === 'user' ? 'You' : 'Assistant'}</div><div class="text"></div>`;
      transcriptDiv.appendChild(existingMsg);
    }
    existingMsg.querySelector('.text').textContent = transcript;
  } else if (type === 'final') {
    let existingMsg = transcriptDiv.querySelector(`.message.${role}.partial`);
    if (existingMsg) {
      existingMsg.classList.remove('partial');
      existingMsg.querySelector('.text').textContent = transcript;
    } else {
      const msg = document.createElement('div');
      msg.className = `message ${role}`;
      msg.innerHTML = `<div class="role">${role === 'user' ? 'You' : 'Assistant'}</div><div class="text">${transcript}</div>`;
      transcriptDiv.appendChild(msg);
    }

    if (role === 'assistant') {
      currentSources = window.SaturdayPresenter.extractSourcesFromText(transcript);
      updateSources(currentSources);
    }
  }

  transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
}

function updateSources(sources) {
  const sourcesList = document.getElementById('sources');
  sourcesList.innerHTML = '';

  if (!sources.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Sources will appear here';
    sourcesList.appendChild(empty);
    return;
  }

  sources.forEach((source) => {
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
      document.getElementById('status').textContent = 'Listening for your question';
      vapi.start(config.assistantId);
    }
  });

  document.getElementById('syncBtn').addEventListener('click', async () => {
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.textContent = 'Syncing';

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
  document.getElementById('fallbackInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') sendTextMessage();
  });
}

function sendTextMessage() {
  const input = document.getElementById('fallbackInput');
  const text = input.value.trim();

  if (!text || !vapi) return;

  vapi.send({
    type: 'add-message',
    message: { role: 'user', content: text },
  });

  const transcriptDiv = document.getElementById('transcript');
  const empty = transcriptDiv.querySelector('.empty');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerHTML = `<div class="role">You</div><div class="text">${text}</div>`;
  transcriptDiv.appendChild(msg);
  transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

  input.value = '';
  setSessionState('Waiting for assistant');
}

async function fetchSyncStatus() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();
    document.getElementById('syncStatus').textContent = window.SaturdayPresenter.formatSyncStatus(stats);
    document.getElementById('indexSummary').textContent = window.SaturdayPresenter.formatSyncStatus(stats);
  } catch (error) {
    document.getElementById('syncStatus').textContent = 'No sync data';
    document.getElementById('indexSummary').textContent = 'No sync data';
  }
}

function updateAssistantSummary() {
  document.getElementById('assistantSummary').textContent = window.SaturdayPresenter.formatAssistantLabel(
    config?.assistantProvider,
    config?.assistantModel,
  );
}

function setSessionState(text) {
  document.getElementById('sessionStatus').textContent = text;
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');

  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}
