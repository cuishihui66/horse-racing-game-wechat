(() => {
  const CONFIG = window.APP_CONFIG || {};
  const explicitSessionId = new URL(window.location.href).searchParams.get('sessionId') || '';
  const barrageColors = ['#6c5ce7', '#ff7f72', '#2aa7b9', '#ff9f1c', '#28b485', '#e667af'];

  const state = {
    authToken: '',
    session: null,
    approvedMessages: [],
    socket: null,
    barrageTimer: null,
    countdownTimer: null,
  };

  const refs = {
    shell: document.getElementById('screen-shell'),
    barrageLayer: document.getElementById('barrage-layer'),
    joinTitle: document.getElementById('join-title'),
    joinStatusPill: document.getElementById('join-status-pill'),
    joinCountPill: document.getElementById('join-count-pill'),
    joinQrImage: document.getElementById('join-qr-image'),
    raceTitle: document.getElementById('race-title'),
    raceParticipantCount: document.getElementById('race-participant-count'),
    raceFinishedCount: document.getElementById('race-finished-count'),
    raceFinishLimit: document.getElementById('race-finish-limit'),
    trackLanes: document.getElementById('track-lanes'),
    resultTitle: document.getElementById('result-title'),
    podiumList: document.getElementById('podium-list'),
    finalRankingList: document.getElementById('final-ranking-list'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
  };

  function getApiUrl(path) {
    return `${CONFIG.API_BASE_URL}${path}`;
  }

  async function apiRequest(path, method = 'GET') {
    const response = await fetch(getApiUrl(path), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.authToken}`,
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || '请求失败');
    }

    return payload;
  }

  function escapeHtml(value) {
    return `${value || ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function translateStatus(status) {
    const mapping = {
      waiting: '待命',
      qr_scanning: '扫码报名',
      ready_to_start: '准备就绪',
      countdown: '倒计时',
      playing: '比赛进行中',
      finished: '成绩揭晓',
    };

    return mapping[status] || '待命';
  }

  function getDisplayStage(status) {
    if (status === 'finished') {
      return 'result';
    }

    if (['ready_to_start', 'countdown', 'playing'].includes(status)) {
      return 'race';
    }

    return 'join';
  }

  function getHorseAsset(laneNumber) {
    const normalized = ((Math.max(1, Number(laneNumber) || 1) - 1) % 10) + 1;
    return `./image/horses/horse-${String(normalized).padStart(2, '0')}.png`;
  }

  function setLaneDensity(participantCount) {
    const count = Math.max(1, participantCount || 1);
    if (count <= 5) {
      refs.shell.style.setProperty('--horse-size', '178px');
      refs.shell.style.setProperty('--lane-height', '112px');
      refs.shell.style.setProperty('--lane-gap', '18px');
      return;
    }

    if (count <= 8) {
      refs.shell.style.setProperty('--horse-size', '152px');
      refs.shell.style.setProperty('--lane-height', '92px');
      refs.shell.style.setProperty('--lane-gap', '14px');
      return;
    }

    refs.shell.style.setProperty('--horse-size', '128px');
    refs.shell.style.setProperty('--lane-height', '76px');
    refs.shell.style.setProperty('--lane-gap', '10px');
  }

  function renderJoinStage(session) {
    if (!session) {
      refs.joinTitle.textContent = '等待主持人创建游戏';
      refs.joinStatusPill.textContent = '待命';
      refs.joinCountPill.textContent = '0 人已加入';
      refs.joinQrImage.removeAttribute('src');
      return;
    }

    refs.joinTitle.textContent = session.title || '赛马摇一摇';
    refs.joinStatusPill.textContent = translateStatus(session.status);
    refs.joinCountPill.textContent = `${session.participantCount || 0} 人已加入`;

    if (session.qrCodeImageUrl) {
      refs.joinQrImage.src = session.qrCodeImageUrl;
    } else {
      refs.joinQrImage.removeAttribute('src');
    }
  }

  function createLane(participant, status) {
    const progress = Math.max(0, Math.min(100, Number(participant.progressPercent) || 0));
    const movementClass =
      status === 'playing' ? 'is-racing' : status === 'finished' || participant.isFinished ? '' : 'is-idle';
    const finishedClass = participant.isFinished ? 'is-finished' : '';
    const laneLabel = String(participant.laneNumber || 0).padStart(2, '0');
    const runnerLeft = `calc((100% - var(--horse-size) - 58px) * ${progress / 100})`;

    return `
      <article class="lane-row">
        <div class="lane-badge">${laneLabel}</div>
        <div class="lane-track">
          <div class="horse-runner ${movementClass} ${finishedClass}" style="left:${runnerLeft};">
            <img src="${getHorseAsset(participant.laneNumber)}" alt="${escapeHtml(participant.wechatNickname)}">
            <div class="horse-nameplate">
              <strong>${laneLabel}</strong>
              <span>${escapeHtml(participant.wechatNickname)}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderRaceStage(session) {
    if (!session) {
      refs.raceTitle.textContent = '赛马摇一摇';
      refs.raceParticipantCount.textContent = '0';
      refs.raceFinishedCount.textContent = '0';
      refs.raceFinishLimit.textContent = 'TOP 5';
      refs.trackLanes.innerHTML = '';
      return;
    }

    const participants = (session.participants || [])
      .slice()
      .sort((left, right) => (left.laneNumber || 0) - (right.laneNumber || 0));

    refs.raceTitle.textContent = session.title || '赛马摇一摇';
    refs.raceParticipantCount.textContent = String(session.participantCount || participants.length || 0);
    refs.raceFinishedCount.textContent = String(session.finishedCount || 0);
    refs.raceFinishLimit.textContent = `TOP ${session.finishLimit || 5}`;
    setLaneDensity(participants.length);

    refs.trackLanes.innerHTML = participants.map((participant) => createLane(participant, session.status)).join('');
  }

  function renderResultStage(session) {
    const finalRankings = session?.finalRankings || [];
    if (!finalRankings.length) {
      refs.resultTitle.textContent = '冠军诞生';
      refs.podiumList.innerHTML = '';
      refs.finalRankingList.innerHTML = '';
      return;
    }

    const topThree = finalRankings.slice(0, 3);
    const topFive = finalRankings.slice(0, 5);
    refs.resultTitle.textContent = session?.title ? `${session.title} · 冠军诞生` : '冠军诞生';

    refs.podiumList.innerHTML = topThree
      .map(
        (entry) => `
          <article class="podium-card rank-${entry.rank}">
            <span class="podium-rank">${entry.rank}</span>
            <img src="${escapeHtml(entry.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div class="podium-name">${escapeHtml(entry.wechatNickname)}</div>
            <div class="podium-caption">点击 ${entry.tapCount || 0} 次 · ${Math.round(entry.progressPercent || 0)}%</div>
          </article>
        `,
      )
      .join('');

    refs.finalRankingList.innerHTML = topFive
      .map(
        (entry) => `
          <article class="final-rank-card">
            <div class="final-rank-no">${entry.rank}</div>
            <img src="${escapeHtml(entry.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div>
              <div class="final-rank-name">${escapeHtml(entry.wechatNickname)}</div>
              <div class="final-rank-meta">${entry.isFinished ? '成功冲线' : '按当前距离结算'}</div>
            </div>
            <div class="final-rank-progress">${Math.round(entry.progressPercent || 0)}%</div>
          </article>
        `,
      )
      .join('');
  }

  function updateCountdown() {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;

    const session = state.session;
    if (!session || session.status !== 'countdown' || !session.countdownEndsAt) {
      refs.countdownOverlay.classList.add('hidden');
      return;
    }

    refs.countdownOverlay.classList.remove('hidden');
    const paint = () => {
      const remainMs = session.countdownEndsAt - Date.now();
      const remain = Math.max(0, Math.ceil(remainMs / 1000));
      refs.countdownNumber.textContent = String(Math.max(1, remain));

      if (remainMs <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
      }
    };

    paint();
    state.countdownTimer = setInterval(paint, 120);
  }

  function renderSession() {
    const session = state.session;
    const stage = getDisplayStage(session?.status);
    refs.shell.dataset.stage = session ? stage : 'idle';
    refs.shell.style.setProperty('--wall-opacity', String(session?.wallOpacity || 0.72));

    renderJoinStage(session);
    renderRaceStage(session);
    renderResultStage(session);
    updateCountdown();
  }

  function addOrUpdateApprovedMessage(message) {
    const list = [...state.approvedMessages];
    const index = list.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      list[index] = { ...list[index], ...message };
    } else {
      list.push(message);
    }
    state.approvedMessages = list;
  }

  function removeApprovedMessage(messageId) {
    state.approvedMessages = state.approvedMessages.filter(
      (item) => item.id !== messageId && item.messageId !== messageId,
    );
  }

  async function syncApprovedMessagesForSession(sessionId) {
    if (!sessionId) {
      state.approvedMessages = [];
      return;
    }

    try {
      state.approvedMessages = await apiRequest(`/wall/${sessionId}/approved-messages`);
    } catch (error) {
      console.error(error);
    }
  }

  function spawnBarrage(message) {
    if (!message || (!message.content && !message.imageUrl)) {
      return;
    }

    const item = document.createElement('div');
    const top = 28 + Math.random() * Math.max(120, window.innerHeight * 0.18);
    const duration = message.isTop ? 13 + Math.random() * 3 : 10 + Math.random() * 3;
    const color = barrageColors[Math.floor(Math.random() * barrageColors.length)];

    item.className = `barrage-item ${message.isTop ? 'top' : ''}`;
    item.style.top = `${top}px`;
    item.style.animationDuration = `${duration}s`;
    item.innerHTML = `
      <img src="${escapeHtml(message.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
      <strong style="color:${color}">${escapeHtml(message.wechatNickname || '匿名用户')}</strong>
      <span>${escapeHtml(message.content || '发送了一条图片弹幕')}</span>
    `;

    refs.barrageLayer.appendChild(item);
    item.addEventListener('animationend', () => item.remove(), { once: true });
  }

  function ensureBarrageLoop() {
    if (state.barrageTimer) {
      return;
    }

    state.barrageTimer = setInterval(() => {
      if (!state.session || !state.approvedMessages.length) {
        return;
      }

      const randomMessage =
        state.approvedMessages[Math.floor(Math.random() * state.approvedMessages.length)];
      spawnBarrage(randomMessage);
    }, 1800);
  }

  function applySessionState(nextSession) {
    if (!nextSession) {
      return;
    }

    if (explicitSessionId && nextSession.id !== explicitSessionId) {
      return;
    }

    const previousSessionId = state.session?.id;
    state.session = nextSession;
    renderSession();

    if (previousSessionId !== nextSession.id) {
      syncApprovedMessagesForSession(nextSession.id).catch((error) => console.error(error));
    }
  }

  function mergeRaceUpdate(payload) {
    if (!state.session || payload.sessionId !== state.session.id) {
      return;
    }

    const nextParticipants = (state.session.participants || []).map((participant) =>
      participant.userId === payload.participant.userId ? payload.participant : participant,
    );

    state.session = {
      ...state.session,
      participants: nextParticipants,
      currentRankings: payload.currentTopRankings || state.session.currentRankings,
      finishedCount: payload.finishedCount,
      totalTapCount: payload.totalTapCount || state.session.totalTapCount,
    };

    renderSession();
  }

  async function ensureDevToken() {
    const response = await fetch(getApiUrl('/auth/dev-host-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || '无法获取大屏令牌');
    }
    state.authToken = payload.accessToken;
  }

  function connectSocket() {
    if (state.socket) {
      state.socket.disconnect();
    }

    state.socket = io(CONFIG.WS_BASE_URL, {
      auth: { token: state.authToken },
      query: { type: 'large_screen' },
      transports: ['websocket', 'polling'],
    });

    state.socket.on('game_state_init', applySessionState);
    state.socket.on('game_state_update', applySessionState);
    state.socket.on('horse_position_update', mergeRaceUpdate);
    state.socket.on('game_finished', (payload) => {
      if (!state.session || payload.sessionId !== state.session.id) {
        return;
      }

      state.session = {
        ...state.session,
        status: 'finished',
        finalRankings: payload.finalRankings || [],
        currentRankings: payload.finalRankings || [],
      };
      renderSession();
    });

    state.socket.on('approved_wall_messages_init', (messages) => {
      state.approvedMessages = (messages || []).filter((message) => {
        if (!state.session) {
          return true;
        }
        return message.gameSessionId === state.session.id;
      });
    });

    state.socket.on('wall_message_approved', (message) => {
      if (state.session && message.gameSessionId !== state.session.id) {
        return;
      }
      addOrUpdateApprovedMessage(message);
      spawnBarrage(message);
    });

    state.socket.on('wall_message_deleted', (payload) => {
      if (state.session && payload.gameSessionId !== state.session.id) {
        return;
      }
      removeApprovedMessage(payload.messageId || payload.id);
    });

    state.socket.on('wall_message_updated', (payload) => {
      if (state.session && payload.gameSessionId !== state.session.id) {
        return;
      }
      state.approvedMessages = state.approvedMessages.map((message) =>
        message.id === (payload.messageId || payload.id)
          ? { ...message, ...(payload.updates || {}) }
          : message,
      );
    });
  }

  async function bootstrap() {
    await ensureDevToken();

    if (explicitSessionId) {
      const session = await apiRequest(`/game/${explicitSessionId}/state`);
      applySessionState(session);
      await syncApprovedMessagesForSession(explicitSessionId);
    } else {
      const currentSession = await apiRequest('/game/current-display');
      if (currentSession) {
        applySessionState(currentSession);
        await syncApprovedMessagesForSession(currentSession.id);
      }
    }

    ensureBarrageLoop();
    connectSocket();
    renderSession();
  }

  bootstrap().catch((error) => {
    console.error(error);
    renderSession();
  });
})();
