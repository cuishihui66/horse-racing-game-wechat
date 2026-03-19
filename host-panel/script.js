(() => {
  const CONFIG = window.APP_CONFIG || {};
  const DISPLAY_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8080`;

  const state = {
    authToken: localStorage.getItem('authToken') || '',
    currentSessionId: null,
    currentSession: null,
    sessions: [],
    pendingMessages: [],
    approvedMessages: [],
    socket: null,
    wallOpacityTimer: null,
  };

  const refs = {
    loginView: document.getElementById('login-view'),
    appShell: document.getElementById('app-shell'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    usernameInput: document.getElementById('username-input'),
    passwordInput: document.getElementById('password-input'),
    loginStatus: document.getElementById('login-status'),
    gameTitleInput: document.getElementById('game-title-input'),
    createSessionBtn: document.getElementById('create-session-btn'),
    createFeedback: document.getElementById('create-feedback'),
    displayLink: document.getElementById('display-link'),
    currentSessionTitle: document.getElementById('current-session-title'),
    currentSessionId: document.getElementById('current-session-id'),
    currentStatusPill: document.getElementById('current-status-pill'),
    participantCount: document.getElementById('current-participant-count'),
    finishProgress: document.getElementById('current-finish-progress'),
    reopenJoinBtn: document.getElementById('reopen-join-btn'),
    prepareGameBtn: document.getElementById('prepare-game-btn'),
    startRaceBtn: document.getElementById('start-race-btn'),
    resetGameBtn: document.getElementById('reset-game-btn'),
    wallOpacitySlider: document.getElementById('wall-opacity-slider'),
    wallOpacityValue: document.getElementById('wall-opacity-value'),
    fakeUserCount: document.getElementById('fake-user-count'),
    generateFakeUsersBtn: document.getElementById('generate-fake-users-btn'),
    autoBotSimToggle: document.getElementById('auto-bot-sim-toggle'),
    startBotSimBtn: document.getElementById('start-bot-sim-btn'),
    stopBotSimBtn: document.getElementById('stop-bot-sim-btn'),
    participantList: document.getElementById('participant-list'),
    pendingMessagesList: document.getElementById('pending-messages-list'),
    approvedMessagesList: document.getElementById('approved-messages-list'),
    pendingCountBadge: document.getElementById('pending-count-badge'),
    approvedCountBadge: document.getElementById('approved-count-badge'),
    historyList: document.getElementById('history-list'),
  };

  function getApiUrl(path) {
    return `${CONFIG.API_BASE_URL}${path}`;
  }

  function escapeHtml(value) {
    return `${value || ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showLoginStatus(message, isError = false) {
    refs.loginStatus.textContent = message || '';
    refs.loginStatus.style.color = isError ? '#ff8f92' : '#67d38f';
  }

  function showCreateFeedback(message, isError = false) {
    refs.createFeedback.textContent = message || '';
    refs.createFeedback.style.color = isError ? '#ff8f92' : '#9ab0cf';
  }

  async function apiRequest(path, method = 'GET', body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) {
      headers.Authorization = `Bearer ${state.authToken}`;
    }

    const response = await fetch(getApiUrl(path), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        (payload && typeof payload === 'object' && (payload.message || payload.error)) ||
        response.statusText ||
        '请求失败';
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }

    return payload;
  }

  function translateStatus(status) {
    const mapping = {
      waiting: '待命',
      qr_scanning: '报名中',
      ready_to_start: '准备就绪',
      countdown: '倒计时',
      playing: '比赛进行中',
      finished: '已结束',
    };

    return mapping[status] || '未知状态';
  }

  function statusClass(status) {
    if (status === 'qr_scanning') return 'is-join';
    if (status === 'ready_to_start' || status === 'countdown') return 'is-ready';
    if (status === 'playing') return 'is-race';
    if (status === 'finished') return 'is-finish';
    return 'is-idle';
  }

  function upsertSession(sessionSummary) {
    const next = [...state.sessions];
    const index = next.findIndex((item) => item.id === sessionSummary.id);

    if (index >= 0) {
      next[index] = { ...next[index], ...sessionSummary };
    } else {
      next.unshift(sessionSummary);
    }

    state.sessions = next.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  }

  function upsertMessage(list, message) {
    const next = [...list];
    const index = next.findIndex((item) => item.id === message.id);

    if (index >= 0) {
      next[index] = { ...next[index], ...message };
    } else {
      next.unshift(message);
    }

    return next;
  }

  function removeMessage(list, messageId) {
    return list.filter((item) => item.id !== messageId && item.messageId !== messageId);
  }

  function renderHistory() {
    if (!state.sessions.length) {
      refs.historyList.className = 'history-list empty-state';
      refs.historyList.textContent = '还没有历史记录';
      return;
    }

    refs.historyList.className = 'history-list';
    refs.historyList.innerHTML = state.sessions
      .map((session) => {
        const podiumHtml = (session.podium || [])
          .map(
            (entry) => `
              <span class="podium-chip">
                <span class="podium-rank">${entry.rank}</span>
                ${escapeHtml(entry.wechatNickname)}
              </span>
            `,
          )
          .join('');

        return `
          <article class="history-card">
            <div class="panel-header">
              <div>
                <div class="history-title">${escapeHtml(session.title || '未命名场次')}</div>
                <div class="history-meta">${new Date(session.createdAt).toLocaleString()} · ${session.participantCount || 0} 人</div>
              </div>
              <span class="status-pill ${statusClass(session.status)}">${translateStatus(session.status)}</span>
            </div>
            <div class="podium-row">${podiumHtml || '<span class="history-meta">本场尚未产生领奖名单</span>'}</div>
            <button class="ghost-button manage-session-btn" data-session-id="${session.id}" type="button">切换到本场</button>
          </article>
        `;
      })
      .join('');

    refs.historyList.querySelectorAll('.manage-session-btn').forEach((button) => {
      button.addEventListener('click', () => {
        manageSession(button.dataset.sessionId).catch((error) => {
          showCreateFeedback(error.message, true);
        });
      });
    });
  }

  function renderParticipants() {
    const participants = state.currentSession?.participants || [];

    if (!participants.length) {
      refs.participantList.className = 'participant-list empty-state';
      refs.participantList.textContent = '等待用户加入';
      return;
    }

    refs.participantList.className = 'participant-list';
    refs.participantList.innerHTML = participants
      .slice()
      .sort((left, right) => (left.laneNumber || 0) - (right.laneNumber || 0))
      .map((participant) => {
        const detail = participant.finalRank
          ? `第 ${participant.finalRank} 名`
          : `点击 ${participant.tapCount} 次 · ${Math.round(participant.progressPercent || 0)}%`;

        return `
          <div class="participant-card">
            <img class="avatar" src="${escapeHtml(participant.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div>
              <div class="participant-name">${escapeHtml(participant.wechatNickname)}</div>
              <div class="participant-meta">赛道 ${participant.laneNumber} · ${detail}</div>
            </div>
            <span class="horse-chip" style="background:${escapeHtml(participant.horseColor || '#9ab0cf')}"></span>
          </div>
        `;
      })
      .join('');
  }

  function createMessageCard(message, mode) {
    const isPending = mode === 'pending';
    const isTop = Boolean(message.isTop);
    const timeText = message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : '--';

    return `
      <article class="message-card ${isTop ? 'is-top' : ''}">
        <div class="message-head">
          <img class="avatar" src="${escapeHtml(message.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
          <div>
            <div class="participant-name">${escapeHtml(message.wechatNickname || '匿名用户')}</div>
            <div class="message-meta">${timeText}</div>
          </div>
          ${isTop ? '<span class="count-badge">置顶</span>' : ''}
        </div>
        <div class="message-content">${escapeHtml(message.content || '图片弹幕')}</div>
        <div class="message-actions">
          ${
            isPending
              ? `
                <button class="mini-button primary approve-message-btn" data-message-id="${message.id}" type="button">通过</button>
                <button class="mini-button danger reject-message-btn" data-message-id="${message.id}" type="button">拒绝</button>
              `
              : `
                <button class="mini-button warn toggle-top-btn" data-message-id="${message.id}" data-next-top="${(!isTop).toString()}" type="button">${isTop ? '取消置顶' : '置顶'}</button>
                <button class="mini-button danger delete-message-btn" data-message-id="${message.id}" type="button">删除</button>
              `
          }
        </div>
      </article>
    `;
  }

  function bindMessageActions() {
    refs.pendingMessagesList.querySelectorAll('.approve-message-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await apiRequest(`/wall/${state.currentSessionId}/message/${button.dataset.messageId}/approve`, 'POST');
        await fetchWallMessages();
      });
    });

    refs.pendingMessagesList.querySelectorAll('.reject-message-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await apiRequest(`/wall/${state.currentSessionId}/message/${button.dataset.messageId}/reject`, 'POST');
        await fetchWallMessages();
      });
    });

    refs.approvedMessagesList.querySelectorAll('.delete-message-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await apiRequest(`/wall/${state.currentSessionId}/message/${button.dataset.messageId}/delete`, 'POST');
        await fetchWallMessages();
      });
    });

    refs.approvedMessagesList.querySelectorAll('.toggle-top-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await apiRequest(`/wall/${state.currentSessionId}/message/${button.dataset.messageId}/toggle-top`, 'POST', {
          isTop: button.dataset.nextTop === 'true',
        });
        await fetchWallMessages();
      });
    });
  }

  function renderMessages() {
    refs.pendingCountBadge.textContent = String(state.pendingMessages.length);
    refs.approvedCountBadge.textContent = String(state.approvedMessages.length);

    if (!state.pendingMessages.length) {
      refs.pendingMessagesList.className = 'message-list empty-state';
      refs.pendingMessagesList.textContent = '暂无待审核消息';
    } else {
      refs.pendingMessagesList.className = 'message-list';
      refs.pendingMessagesList.innerHTML = state.pendingMessages
        .map((message) => createMessageCard(message, 'pending'))
        .join('');
    }

    if (!state.approvedMessages.length) {
      refs.approvedMessagesList.className = 'message-list empty-state';
      refs.approvedMessagesList.textContent = '暂无已通过消息';
    } else {
      refs.approvedMessagesList.className = 'message-list';
      refs.approvedMessagesList.innerHTML = state.approvedMessages
        .slice()
        .sort((left, right) => Number(right.isTop) - Number(left.isTop))
        .map((message) => createMessageCard(message, 'approved'))
        .join('');
    }

    bindMessageActions();
  }

  function renderSessionSummary() {
    const session = state.currentSession;

    if (!session) {
      refs.currentSessionTitle.textContent = '当前没有激活场次';
      refs.currentSessionId.textContent = '-';
      refs.currentStatusPill.textContent = '待命';
      refs.currentStatusPill.className = 'status-pill is-idle';
      refs.participantCount.textContent = '0';
      refs.finishProgress.textContent = '0 / 0';
      refs.displayLink.href = DISPLAY_BASE_URL;
      refs.generateFakeUsersBtn.disabled = true;
      refs.startBotSimBtn.disabled = true;
      refs.stopBotSimBtn.disabled = true;
      refs.reopenJoinBtn.disabled = true;
      return;
    }

    refs.currentSessionTitle.textContent = session.title || '未命名场次';
    refs.currentSessionId.textContent = session.id;
    refs.currentStatusPill.textContent = translateStatus(session.status);
    refs.currentStatusPill.className = `status-pill ${statusClass(session.status)}`;
    refs.participantCount.textContent = String(session.participantCount || 0);
    refs.finishProgress.textContent = `${session.finishedCount || 0} / ${session.finishLimit || 0}`;
    refs.wallOpacitySlider.value = String(Math.round((session.wallOpacity || 0.72) * 100));
    refs.wallOpacityValue.textContent = `${Math.round((session.wallOpacity || 0.72) * 100)}%`;
    refs.displayLink.href = `${DISPLAY_BASE_URL}?sessionId=${encodeURIComponent(session.id)}`;

    refs.prepareGameBtn.disabled = !(session.status === 'qr_scanning' && session.participantCount > 0);
    refs.startRaceBtn.disabled = session.status !== 'ready_to_start';
    refs.resetGameBtn.disabled = !['ready_to_start', 'countdown', 'playing', 'finished', 'qr_scanning'].includes(session.status);
    refs.reopenJoinBtn.disabled = !state.currentSessionId;
    refs.generateFakeUsersBtn.disabled = session.status !== 'qr_scanning';
    refs.startBotSimBtn.disabled =
      !['ready_to_start', 'countdown', 'playing'].includes(session.status) || session.simulationActive;
    refs.stopBotSimBtn.disabled = !session.simulationActive;
  }

  function renderAll() {
    renderSessionSummary();
    renderParticipants();
    renderMessages();
    renderHistory();
  }

  async function fetchSessions() {
    state.sessions = await apiRequest('/game/sessions');
    renderHistory();
    return state.sessions;
  }

  async function fetchSessionState(sessionId) {
    const session = await apiRequest(`/game/${sessionId}/state`);
    state.currentSession = session;
    state.currentSessionId = session.id;

    upsertSession({
      id: session.id,
      title: session.title,
      status: session.status,
      participantCount: session.participantCount,
      wallOpacity: session.wallOpacity,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      podium: (session.finalRankings || []).slice(0, 3),
    });

    renderAll();
    return session;
  }

  async function fetchWallMessages() {
    if (!state.currentSessionId) {
      return;
    }

    const [pendingMessages, approvedMessages] = await Promise.all([
      apiRequest(`/wall/${state.currentSessionId}/pending-messages`),
      apiRequest(`/wall/${state.currentSessionId}/approved-messages`),
    ]);

    state.pendingMessages = pendingMessages;
    state.approvedMessages = approvedMessages;
    renderMessages();
  }

  function disconnectSocket() {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
  }

  function connectSocket(sessionId) {
    disconnectSocket();

    state.socket = io(CONFIG.WS_BASE_URL, {
      auth: { token: state.authToken },
      query: { type: 'host_panel', sessionId },
      transports: ['websocket', 'polling'],
    });

    state.socket.on('game_state_init', (session) => {
      if (session?.id === state.currentSessionId) {
        state.currentSession = session;
        renderAll();
      }
    });

    state.socket.on('game_state_update', (session) => {
      if (session?.id === state.currentSessionId) {
        state.currentSession = session;
        upsertSession({
          id: session.id,
          title: session.title,
          status: session.status,
          participantCount: session.participantCount,
          wallOpacity: session.wallOpacity,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          podium: (session.finalRankings || []).slice(0, 3),
        });
        renderAll();
      }
    });

    state.socket.on('horse_position_update', (payload) => {
      if (!state.currentSession || payload.sessionId !== state.currentSession.id) {
        return;
      }

      const participants = (state.currentSession.participants || []).map((participant) =>
        participant.userId === payload.participant.userId ? payload.participant : participant,
      );

      state.currentSession = {
        ...state.currentSession,
        participants,
        currentRankings: payload.currentTopRankings || [],
        finishedCount: payload.finishedCount,
      };

      renderSessionSummary();
      renderParticipants();
    });

    state.socket.on('participant_joined', (payload) => {
      if (!state.currentSession || payload.sessionId !== state.currentSession.id) {
        return;
      }

      const nextParticipants = [...(state.currentSession.participants || []), payload.participant];
      state.currentSession = {
        ...state.currentSession,
        participants: nextParticipants,
        participantCount: nextParticipants.length,
      };

      renderSessionSummary();
      renderParticipants();
    });

    state.socket.on('game_finished', (payload) => {
      if (!state.currentSession || payload.sessionId !== state.currentSession.id) {
        return;
      }

      state.currentSession = {
        ...state.currentSession,
        status: 'finished',
        finalRankings: payload.finalRankings || [],
      };

      renderAll();
      fetchSessions().catch(() => {});
    });

    state.socket.on('pending_wall_messages', (messages) => {
      state.pendingMessages = messages || [];
      renderMessages();
    });

    state.socket.on('approved_wall_messages_init', (messages) => {
      state.approvedMessages = messages || [];
      renderMessages();
    });

    state.socket.on('wall_message_pending', (message) => {
      state.pendingMessages = upsertMessage(state.pendingMessages, message);
      renderMessages();
    });

    state.socket.on('wall_message_approved', (message) => {
      state.pendingMessages = removeMessage(state.pendingMessages, message.id);
      state.approvedMessages = upsertMessage(state.approvedMessages, message);
      renderMessages();
    });

    state.socket.on('wall_message_deleted', (payload) => {
      const messageId = payload.messageId || payload.id;
      state.pendingMessages = removeMessage(state.pendingMessages, messageId);
      state.approvedMessages = removeMessage(state.approvedMessages, messageId);
      renderMessages();
    });

    state.socket.on('wall_message_updated', (payload) => {
      const messageId = payload.messageId || payload.id;
      state.approvedMessages = state.approvedMessages.map((message) =>
        message.id === messageId ? { ...message, ...(payload.updates || {}) } : message,
      );
      renderMessages();
    });

    state.socket.on('exception', (payload) => {
      showCreateFeedback(payload?.message || '操作失败', true);
    });
  }

  async function manageSession(sessionId) {
    await fetchSessionState(sessionId);
    await fetchWallMessages();
    connectSocket(sessionId);
  }

  function showApp() {
    refs.loginView.classList.add('hidden');
    refs.appShell.classList.remove('hidden');
  }

  function showLogin() {
    refs.loginView.classList.remove('hidden');
    refs.appShell.classList.add('hidden');
  }

  async function login() {
    refs.loginBtn.disabled = true;
    showLoginStatus('');

    try {
      const payload = await apiRequest('/auth/dev-host-login', 'POST', {
        username: refs.usernameInput.value,
        password: refs.passwordInput.value,
      });

      state.authToken = payload.accessToken;
      localStorage.setItem('authToken', state.authToken);
      showApp();
      showLoginStatus('登录成功');
      await bootstrapApp();
    } catch (error) {
      showLoginStatus(error.message || '登录失败', true);
    } finally {
      refs.loginBtn.disabled = false;
    }
  }

  function logout() {
    state.authToken = '';
    state.currentSessionId = null;
    state.currentSession = null;
    state.sessions = [];
    state.pendingMessages = [];
    state.approvedMessages = [];
    localStorage.removeItem('authToken');
    disconnectSocket();
    showLogin();
    showLoginStatus('');
  }

  async function bootstrapApp() {
    const sessions = await fetchSessions();
    const activeSession = sessions.find((session) => session.status !== 'finished') || sessions[0];

    if (activeSession) {
      await manageSession(activeSession.id);
    } else {
      renderAll();
    }
  }

  async function createSession() {
    refs.createSessionBtn.disabled = true;
    showCreateFeedback('正在创建场次...');

    try {
      const created = await apiRequest('/game/create-session', 'POST', {
        title: refs.gameTitleInput.value.trim(),
      });

      refs.gameTitleInput.value = '';
      showCreateFeedback('场次已创建，大屏已进入报名展示阶段。');
      await fetchSessions();
      await manageSession(created.id || created.gameSessionId);
    } catch (error) {
      showCreateFeedback(error.message || '创建失败', true);
    } finally {
      refs.createSessionBtn.disabled = false;
    }
  }

  async function reopenJoin() {
    if (!state.currentSessionId) return;
    await apiRequest(`/game/${state.currentSessionId}/start-qr-scan`, 'POST');
  }

  async function prepareGame() {
    if (!state.currentSessionId) return;
    await apiRequest(`/game/${state.currentSessionId}/prepare`, 'POST');
  }

  async function startRace() {
    if (!state.currentSessionId) return;
    await apiRequest(`/game/${state.currentSessionId}/start`, 'POST');

    if (refs.autoBotSimToggle.checked) {
      await apiRequest(`/game/${state.currentSessionId}/dev/simulation/start`, 'POST');
      await fetchSessionState(state.currentSessionId);
    }
  }

  async function resetGame() {
    if (!state.currentSessionId) return;
    await apiRequest(`/game/${state.currentSessionId}/reset`, 'POST');
  }

  async function generateFakeUsers() {
    if (!state.currentSessionId) return;

    const count = Math.max(1, Math.min(30, Number(refs.fakeUserCount.value) || 1));
    refs.fakeUserCount.value = String(count);
    const result = await apiRequest(`/game/${state.currentSessionId}/dev/fake-users`, 'POST', { count });
    await fetchSessionState(state.currentSessionId);
    showCreateFeedback(`已生成 ${result.createdCount || count} 个假用户`);
  }

  async function startBotSimulation() {
    if (!state.currentSessionId) return;
    const result = await apiRequest(`/game/${state.currentSessionId}/dev/simulation/start`, 'POST');
    await fetchSessionState(state.currentSessionId);
    showCreateFeedback(`模拟点击已启动，Bot 数量 ${result.botCount || 0}`);
  }

  async function stopBotSimulation() {
    if (!state.currentSessionId) return;
    await apiRequest(`/game/${state.currentSessionId}/dev/simulation/stop`, 'POST');
    await fetchSessionState(state.currentSessionId);
    showCreateFeedback('模拟点击已停止');
  }

  function saveWallOpacity() {
    if (!state.currentSessionId) {
      return;
    }

    clearTimeout(state.wallOpacityTimer);
    const wallOpacity = Number(refs.wallOpacitySlider.value) / 100;
    refs.wallOpacityValue.textContent = `${Math.round(wallOpacity * 100)}%`;

    state.wallOpacityTimer = setTimeout(async () => {
      try {
        await apiRequest(`/game/${state.currentSessionId}/wall-settings`, 'POST', { wallOpacity });
      } catch (error) {
        showCreateFeedback(error.message || '更新弹幕透明度失败', true);
      }
    }, 220);
  }

  refs.loginBtn.addEventListener('click', () => {
    login().catch((error) => showLoginStatus(error.message || '登录失败', true));
  });

  refs.passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      login().catch((error) => showLoginStatus(error.message || '登录失败', true));
    }
  });

  refs.logoutBtn.addEventListener('click', logout);
  refs.createSessionBtn.addEventListener('click', () => {
    createSession().catch((error) => showCreateFeedback(error.message || '创建失败', true));
  });
  refs.reopenJoinBtn.addEventListener('click', () => {
    reopenJoin().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.prepareGameBtn.addEventListener('click', () => {
    prepareGame().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.startRaceBtn.addEventListener('click', () => {
    startRace().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.resetGameBtn.addEventListener('click', () => {
    resetGame().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.generateFakeUsersBtn.addEventListener('click', () => {
    generateFakeUsers().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.startBotSimBtn.addEventListener('click', () => {
    startBotSimulation().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.stopBotSimBtn.addEventListener('click', () => {
    stopBotSimulation().catch((error) => showCreateFeedback(error.message || '操作失败', true));
  });
  refs.wallOpacitySlider.addEventListener('input', saveWallOpacity);

  if (state.authToken) {
    showApp();
    bootstrapApp().catch((error) => {
      console.error(error);
      logout();
    });
  } else {
    showLogin();
  }
})();
