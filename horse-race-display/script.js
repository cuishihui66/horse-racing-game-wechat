(() => {
  const CONFIG = window.APP_CONFIG || {};
  const colorPool = ['#36d3c9', '#ff9f5a', '#ffd36f', '#8ef8a9', '#8fb7ff', '#ff8fb1'];
  const explicitSessionId = new URL(window.location.href).searchParams.get('sessionId') || '';

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
    sessionTitle: document.getElementById('session-title'),
    joinStageTitle: document.getElementById('join-stage-title'),
    statusPill: document.getElementById('status-pill'),
    participantPill: document.getElementById('participant-pill'),
    tapPill: document.getElementById('tap-pill'),
    finishLimit: document.getElementById('finish-limit'),
    finishedCount: document.getElementById('finished-count'),
    qrCodeImage: document.getElementById('qr-code-image'),
    joinStage: document.getElementById('join-stage'),
    joinRoster: document.getElementById('join-roster'),
    trackLanes: document.getElementById('track-lanes'),
    rankingList: document.getElementById('ranking-list'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
    finishOverlay: document.getElementById('finish-overlay'),
    podiumList: document.getElementById('podium-list'),
    finalRankingList: document.getElementById('final-ranking-list'),
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
      qr_scanning: '扫码报名中',
      ready_to_start: '准备就绪',
      countdown: '倒计时',
      playing: '全速冲刺',
      finished: '冠军揭晓',
    };
    return mapping[status] || '未知状态';
  }

  function statusClass(status) {
    if (status === 'qr_scanning') return 'is-join';
    if (status === 'ready_to_start' || status === 'countdown') return 'is-ready';
    if (status === 'playing') return 'is-racing';
    if (status === 'finished') return 'is-finished';
    return 'is-waiting';
  }

  function buildHorseSvg(participant) {
    const id = `horse-${participant.userId}`.replace(/[^a-zA-Z0-9_-]/g, '');
    const coat = participant.horseColor || '#ff9f5a';
    const accent = participant.horseAccentColor || '#ffd36f';

    return `
      <svg class="pony-svg" viewBox="0 0 170 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="${id}-coat" x1="0%" x2="100%">
            <stop offset="0%" stop-color="${coat}" />
            <stop offset="100%" stop-color="${accent}" />
          </linearGradient>
        </defs>
        <ellipse cx="70" cy="63" rx="40" ry="24" fill="url(#${id}-coat)" />
        <ellipse cx="118" cy="42" rx="21" ry="18" fill="url(#${id}-coat)" />
        <rect x="101" y="55" width="14" height="20" rx="6" fill="url(#${id}-coat)" />
        <path d="M34 54 C12 42, 8 22, 18 18 C31 14, 44 35, 49 48 Z" fill="${accent}" />
        <path d="M120 22 C129 6, 145 9, 147 24 C141 18, 132 20, 127 28 Z" fill="${accent}" />
        <path d="M109 19 C117 3, 136 3, 142 19 C133 14, 119 15, 109 23 Z" fill="${accent}" />
        <circle cx="124" cy="41" r="3.5" fill="#1f2937" />
        <circle cx="129" cy="47" r="2.5" fill="#f8fafc" opacity="0.85" />
        <rect x="50" y="79" width="10" height="22" rx="4" fill="#2f1e16" />
        <rect x="72" y="79" width="10" height="22" rx="4" fill="#2f1e16" />
        <rect x="96" y="79" width="10" height="22" rx="4" fill="#2f1e16" />
        <rect x="117" y="79" width="10" height="22" rx="4" fill="#2f1e16" />
      </svg>
    `;
  }

  function renderJoinRoster(participants) {
    if (!participants.length) {
      refs.joinRoster.innerHTML = '<span class="hero-chip">等待第一位骑手加入</span>';
      return;
    }

    refs.joinRoster.innerHTML = participants
      .slice(0, 10)
      .map(
        (participant) => `
          <div class="join-rider">
            <img src="${escapeHtml(participant.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <span>${escapeHtml(participant.wechatNickname)}</span>
          </div>
        `,
      )
      .join('');
  }

  function renderTrack(participants, status) {
    if (!participants.length) {
      refs.trackLanes.innerHTML = '<div class="hero-chip">主持人创建场次后，赛道将在这里点亮。</div>';
      return;
    }

    refs.trackLanes.innerHTML = participants
      .slice()
      .sort((left, right) => left.laneNumber - right.laneNumber)
      .map((participant) => {
        const progress = Math.max(0, Math.min(100, participant.progressPercent || 0));
        const meta = participant.finalRank
          ? `第 ${participant.finalRank} 名完赛`
          : `点击 ${participant.tapCount} 次 · ${progress.toFixed(1)}%`;
        return `
          <div class="lane-row">
            <div class="lane-label">
              <div class="lane-badge">${String(participant.laneNumber).padStart(2, '0')}</div>
              <img class="lane-avatar" src="${escapeHtml(participant.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
              <div>
                <div class="lane-name">${escapeHtml(participant.wechatNickname)}</div>
                <div class="lane-meta">${meta}</div>
              </div>
            </div>
            <div class="lane-track">
              <div class="pony ${status === 'playing' ? 'is-racing' : ''} ${participant.isFinished ? 'is-finished' : ''}" style="left: calc((100% - 144px) * ${progress / 100});">
                ${buildHorseSvg(participant)}
                <div class="pony-nameplate">
                  <span class="pony-badge">${escapeHtml(participant.horseBadge || '马')}</span>
                  <span>${escapeHtml(participant.wechatNickname)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderRankings(rankings) {
    if (!rankings.length) {
      refs.rankingList.innerHTML = '<div class="hero-chip">比赛开始后会实时刷新排名</div>';
      return;
    }

    refs.rankingList.innerHTML = rankings
      .slice(0, 5)
      .map(
        (entry) => `
          <div class="rank-card">
            <div class="rank-no">${entry.rank}</div>
            <img src="${escapeHtml(entry.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div>
              <div class="rank-name">${escapeHtml(entry.wechatNickname)}</div>
              <div class="rank-meta">${entry.isFinished ? '已冲线' : `点击 ${entry.tapCount || 0} 次`}</div>
            </div>
            <div class="rank-progress">${Math.round(entry.progressPercent || 0)}%</div>
          </div>
        `,
      )
      .join('');
  }

  function renderResultOverlay(finalRankings) {
    if (!finalRankings.length) {
      refs.finishOverlay.classList.add('hidden');
      refs.podiumList.innerHTML = '';
      refs.finalRankingList.innerHTML = '';
      return;
    }

    refs.finishOverlay.classList.remove('hidden');
    refs.podiumList.innerHTML = finalRankings
      .slice(0, 3)
      .map(
        (entry) => `
          <div class="podium-card rank-${entry.rank}">
            <span class="podium-rank">${entry.rank}</span>
            <img src="${escapeHtml(entry.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div class="podium-name">${escapeHtml(entry.wechatNickname)}</div>
            <div class="podium-caption">点击 ${entry.tapCount || 0} 次 · ${Math.round(entry.progressPercent || 100)}%</div>
          </div>
        `,
      )
      .join('');

    refs.finalRankingList.innerHTML = finalRankings
      .slice(0, 5)
      .map(
        (entry) => `
          <div class="final-rank-card">
            <div class="final-rank-no">${entry.rank}</div>
            <img src="${escapeHtml(entry.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
            <div>
              <div class="final-rank-name">${escapeHtml(entry.wechatNickname)}</div>
              <div class="final-rank-meta">${entry.isFinished ? '已抵达终点' : '按当前距离结算'}</div>
            </div>
            <div class="rank-progress">${Math.round(entry.progressPercent || 0)}%</div>
          </div>
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
    const renderCountdownFrame = () => {
      const remainingMs = session.countdownEndsAt - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      refs.countdownNumber.textContent = String(Math.max(remaining, 1));
      if (remainingMs <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
      }
    };

    renderCountdownFrame();
    state.countdownTimer = setInterval(renderCountdownFrame, 120);
  }

  function renderSession() {
    const session = state.session;
    if (!session) {
      refs.sessionTitle.textContent = '等待主持人创建游戏';
      refs.joinStageTitle.textContent = '新一轮互动赛即将开始';
      refs.statusPill.textContent = '待命';
      refs.statusPill.className = 'status-pill is-waiting';
      refs.participantPill.textContent = '0 位骑手';
      refs.tapPill.textContent = '0 次冲刺';
      refs.finishLimit.textContent = 'TOP 5';
      refs.finishedCount.textContent = '0';
      refs.joinStage.classList.remove('is-hidden');
      refs.qrCodeImage.removeAttribute('src');
      refs.trackLanes.innerHTML = '<div class="hero-chip">等待场次发布</div>';
      refs.rankingList.innerHTML = '<div class="hero-chip">等待比赛开始</div>';
      refs.joinRoster.innerHTML = '<span class="hero-chip">等待第一位骑手加入</span>';
      refs.finishOverlay.classList.add('hidden');
      refs.shell.style.setProperty('--wall-opacity', '0.72');
      updateCountdown();
      return;
    }

    refs.sessionTitle.textContent = session.title || '赛马摇一摇';
    refs.joinStageTitle.textContent = session.title || '赛马摇一摇';
    refs.statusPill.textContent = translateStatus(session.status);
    refs.statusPill.className = `status-pill ${statusClass(session.status)}`;
    refs.participantPill.textContent = `${session.participantCount || 0} 位骑手`;
    refs.tapPill.textContent = `${session.totalTapCount || 0} 次冲刺`;
    refs.finishLimit.textContent = `TOP ${session.finishLimit || 5}`;
    refs.finishedCount.textContent = String(session.finishedCount || 0);
    refs.qrCodeImage.src = session.qrCodeImageUrl || '';
    refs.joinStage.classList.toggle('is-hidden', session.status !== 'qr_scanning');
    refs.shell.style.setProperty('--wall-opacity', String(session.wallOpacity || 0.72));

    renderJoinRoster(session.participants || []);
    renderTrack(session.participants || [], session.status);
    renderRankings(session.currentRankings || []);
    renderResultOverlay(session.status === 'finished' ? session.finalRankings || [] : []);
    updateCountdown();
  }

  function addOrUpdateApprovedMessage(message) {
    const next = [...state.approvedMessages];
    const index = next.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      next[index] = { ...next[index], ...message };
    } else {
      next.push(message);
    }
    state.approvedMessages = next;
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
    const top = 90 + Math.random() * Math.max(140, window.innerHeight * 0.22);
    const duration = message.isTop ? 14 + Math.random() * 4 : 10 + Math.random() * 4;
    const nameColor = colorPool[Math.floor(Math.random() * colorPool.length)];

    item.className = `barrage-item ${message.isTop ? 'top' : ''}`;
    item.style.top = `${top}px`;
    item.style.animationDuration = `${duration}s`;
    item.innerHTML = `
      <img src="${escapeHtml(message.avatarUrl || 'https://via.placeholder.com/96?text=U')}" alt="">
      <strong style="color:${nameColor}">${escapeHtml(message.wechatNickname || '匿名用户')}</strong>
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
      query: {
        type: 'large_screen',
      },
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
