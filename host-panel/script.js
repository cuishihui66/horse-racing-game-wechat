        socket.on('exception', (error) => { // Generic error from WS guard or backend
            console.error('WS Exception:', error);
            showMessage(loginStatus, `操作失败: ${error.message || JSON.stringify(error)}`, true);
        });

        // Wall Message Events
        socket.on('wall_message_pending', (message) => {
            console.log('Received wall_message_pending:', message);
            if (message.gameSessionId === currentSessionId) {
                addPendingMessage(message);
                updateWallCounts();
                showMessage(wallStatusDisplay, `新消息待审核: ${message.wechatNickname}`, false);
            }
        });

        socket.on('wall_message_approved', (message) => {
            console.log('Received wall_message_approved:', message);
            if (message.gameSessionId === currentSessionId) {
                removePendingMessage(message.id);
                addApprovedMessage(message);
                updateWallCounts();
                showMessage(wallStatusDisplay, `消息已批准: ${message.wechatNickname}`, false);
            }
        });

        socket.on('wall_message_deleted', (data) => {
            console.log('Received wall_message_deleted:', data);
            if (data.gameSessionId === currentSessionId) {
                removePendingMessage(data.id);
                removeApprovedMessage(data.id);
                updateWallCounts();
                showMessage(wallStatusDisplay, `消息已删除`, false);
            }
        });

        socket.on('wall_message_updated', (data) => {
            console.log('Received wall_message_updated:', data);
            if (data.gameSessionId === currentSessionId && data.updates) {
                updateApprovedMessage(data.id, data.updates);
                showMessage(wallStatusDisplay, `消息已更新`, false);
            }
        });

        socket.on('pending_wall_messages', (messages) => {
            console.log('Received initial pending_wall_messages:', messages);
            renderPendingMessages(messages);
            updateWallCounts();
        });

        socket.on('approved_wall_messages_init', (messages) => {
            console.log('Received initial approved_wall_messages_init:', messages);
            renderApprovedMessages(messages);
            updateWallCounts();
        });
    }

    // --- Wall Message Management Functions ---
    function createMessageCard(message, isPending = true) {
        const card = document.createElement('div');
        card.className = 'message-card';
        card.dataset.messageId = message.id;
        if (message.isTop) {
            card.classList.add('top-message');
        }

        const date = new Date(message.createdAt);
        const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        card.innerHTML = `
            <div class="message-header">
                <img src="${message.avatarUrl || 'https://via.placeholder.com/36?text=U'}" class="message-avatar" alt="Avatar">
                <div class="message-info">
                    <span class="message-nickname">${message.wechatNickname || '匿名用户'}</span>
                    <span class="message-time">${timeString}</span>
                </div>
            </div>
            <div class="message-content">${message.content || ''}</div>
            ${message.imageUrl ? `<img src="${message.imageUrl}" class="message-image-preview" alt="Message Image">` : ''}
            <div class="message-actions">
                ${isPending ? `
                    <button class="btn btn-primary approve-btn" data-id="${message.id}">批准</button>
                    <button class="btn btn-danger reject-btn" data-id="${message.id}">拒绝</button>
                ` : `
                    <button class="btn btn-secondary delete-btn" data-id="${message.id}">删除</button>
                    <button class="btn ${message.isTop ? 'btn-warning' : 'btn-info'} toggle-top-btn" data-id="${message.id}" data-istop="${message.isTop}">
                        ${message.isTop ? '取消置顶' : '置顶'}
                    </button>
                `}
            </div>
        `;

        // Attach event listeners for buttons
        if (isPending) {
            card.querySelector('.approve-btn').addEventListener('click', () => approveMessage(message.id));
            card.querySelector('.reject-btn').addEventListener('click', () => rejectMessage(message.id));
        } else {
            card.querySelector('.delete-btn').addEventListener('click', () => deleteMessage(message.id));
            card.querySelector('.toggle-top-btn').addEventListener('click', (e) => toggleTopMessage(message.id, e.target.dataset.istop === 'false'));
        }
        return card;
    }

    function renderPendingMessages(messages) {
        pendingMessagesList.innerHTML = '';
        if (messages.length === 0) {
            pendingMessagesList.innerHTML = '<p class="no-messages">暂无待审核消息</p>';
        } else {
            messages.forEach(message => pendingMessagesList.appendChild(createMessageCard(message, true)));
        }
        updateWallCounts();
    }

    function renderApprovedMessages(messages) {
        approvedMessagesList.innerHTML = '';
        if (messages.length === 0) {
            approvedMessagesList.innerHTML = '<p class="no-messages">暂无已通过消息</p>';
        } else {
            // Sort by isTop (true first), then approvedAt (latest first)
            messages.sort((a, b) => {
                if (a.isTop && !b.isTop) return -1;
                if (!a.isTop && b.isTop) return 1;
                return new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
            });
            messages.forEach(message => approvedMessagesList.appendChild(createMessageCard(message, false)));
        }
        updateWallCounts();
    }

    function addPendingMessage(message) {
        const noMessagesText = pendingMessagesList.querySelector('.no-messages');
        if (noMessagesText) noMessagesText.remove();
        pendingMessagesList.prepend(createMessageCard(message, true));
        updateWallCounts();
    }

    function removePendingMessage(messageId) {
        const card = pendingMessagesList.querySelector(`[data-message-id="${messageId}"]`);
        if (card) card.remove();
        if (pendingMessagesList.children.length === 0) {
            pendingMessagesList.innerHTML = '<p class="no-messages">暂无待审核消息</p>';
        }
        updateWallCounts();
    }

    function addApprovedMessage(message) {
        const noMessagesText = approvedMessagesList.querySelector('.no-messages');
        if (noMessagesText) noMessagesText.remove();
        approvedMessagesList.prepend(createMessageCard(message, false)); // Add to top temporarily, will re-sort on full refresh
        // To maintain sorted order: re-render all approved messages or insert at correct position
        // For simplicity, let's re-render all for now on significant change
        fetchApprovedMessages(); // Re-fetch and re-render to maintain sort order
        updateWallCounts();
    }

    function removeApprovedMessage(messageId) {
        const card = approvedMessagesList.querySelector(`[data-message-id="${messageId}"]`);
        if (card) card.remove();
        if (approvedMessagesList.children.length === 0) {
            approvedMessagesList.innerHTML = '<p class="no-messages">暂无已通过消息</p>';
        }
        updateWallCounts();
    }

    function updateApprovedMessage(messageId, updates) {
        const card = approvedMessagesList.querySelector(`[data-message-id="${messageId}"]`);
        if (card) {
            if (updates.isTop !== undefined) {
                if (updates.isTop) {
                    card.classList.add('top-message');
                    card.querySelector('.toggle-top-btn').textContent = '取消置顶';
                    card.querySelector('.toggle-top-btn').classList.remove('btn-info');
                    card.querySelector('.toggle-top-btn').classList.add('btn-warning');
                    card.querySelector('.toggle-top-btn').dataset.istop = 'true';
                } else {
                    card.classList.remove('top-message');
                    card.querySelector('.toggle-top-btn').textContent = '置顶';
                    card.querySelector('.toggle-top-btn').classList.remove('btn-warning');
                    card.querySelector('.toggle-top-btn').classList.add('btn-info');
                    card.querySelector('.toggle-top-btn').dataset.istop = 'false';
                }
                // Re-sort after isTop change
                fetchApprovedMessages();
            }
        }
    }

    function updateWallCounts() {
        pendingMessagesCount.textContent = pendingMessagesList.querySelectorAll('.message-card').length;
        approvedMessagesCount.textContent = approvedMessagesList.querySelectorAll('.message-card').length;
    }


    // --- API Interactions for Wall Messages ---
    async function fetchPendingMessages() {
        try {
            const messages = await apiRequest(`/wall/${currentSessionId}/pending-messages`, 'GET');
            renderPendingMessages(messages);
        } catch (error) {
            console.error('Failed to fetch pending messages:', error);
            showMessage(wallStatusDisplay, `获取待审核消息失败: ${error.message}`, true);
        }
    }

    async function fetchApprovedMessages() {
        try {
            const messages = await apiRequest(`/wall/${currentSessionId}/approved-messages`, 'GET');
            renderApprovedMessages(messages);
        } catch (error) {
            console.error('Failed to fetch approved messages:', error);
            showMessage(wallStatusDisplay, `获取已通过消息失败: ${error.message}`, true);
        }
    }

    async function approveMessage(messageId) {
        try {
            await apiRequest(`/wall/${currentSessionId}/message/${messageId}/approve`, 'POST');
            showMessage(wallStatusDisplay, '消息已批准', false);
            // WS will handle removal/addition to lists
        } catch (error) {
            showMessage(wallStatusDisplay, `批准消息失败: ${error.message}`, true);
        }
    }

    async function rejectMessage(messageId) {
        try {
            await apiRequest(`/wall/${currentSessionId}/message/${messageId}/reject`, 'POST');
            showMessage(wallStatusDisplay, '消息已拒绝', false);
            removePendingMessage(messageId); // Remove from pending list immediately
        } catch (error) {
            showMessage(wallStatusDisplay, `拒绝消息失败: ${error.message}`, true);
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('确定要删除此消息吗？')) return;
        try {
            await apiRequest(`/wall/${currentSessionId}/message/${messageId}/delete`, 'POST');
            showMessage(wallStatusDisplay, '消息已删除', false);
            // WS will handle removal from lists for others
            removePendingMessage(messageId);
            removeApprovedMessage(messageId);
        } catch (error) {
            showMessage(wallStatusDisplay, `删除消息失败: ${error.message}`, true);
        }
    }

    async function toggleTopMessage(messageId, isTop) {
        try {
            await apiRequest(`/wall/${currentSessionId}/message/${messageId}/toggle-top`, 'POST', { isTop });
            showMessage(wallStatusDisplay, `消息已${isTop ? '置顶' : '取消置顶'}`, false);
            // WS will handle update
        } catch (error) {
            showMessage(wallStatusDisplay, `置顶操作失败: ${error.message}`, true);
        }
    }

    // --- Extend existing functions ---
    const originalInitWebSocket = initWebSocket;
    initWebSocket = () => {
        originalInitWebSocket(); // Call original init
        if (!socket) return;
        // Host panel specific WS events are handled in the WallGateway already
        // This is primarily for receiving broadcasted wall events
    };

    const originalFetchSessionState = fetchSessionState;
    fetchSessionState = async (sessionId) => {
        await originalFetchSessionState(sessionId);
        // Also fetch wall messages when session state is loaded
        if (document.getElementById('wall-messages-view').classList.contains('active')) {
             fetchPendingMessages();
             fetchApprovedMessages();
        }
    };

    const originalHandleManageSessionClick = handleManageSessionClick;
    handleManageSessionClick = async (e) => {
        await originalHandleManageSessionClick(e);
        // After managing a session, also load wall messages if on wall view
        if (document.getElementById('wall-messages-view').classList.contains('active')) {
            fetchPendingMessages();
            fetchApprovedMessages();
        }
    };


    // --- Event Listeners for Wall Message Management ---
    wallToggleActiveBtn.addEventListener('click', () => {
        // This button toggles wall visibility on large screen or submission status.
        // For now, let's just mock the state change.
        if (wallStatusDisplay.classList.contains('status-active')) {
            wallStatusDisplay.classList.remove('status-active');
            wallStatusDisplay.classList.add('status-pending');
            wallStatusDisplay.textContent = '留言墙状态: 已关闭';
            wallToggleActiveBtn.textContent = '开启留言墙';
            wallToggleActiveBtn.classList.remove('btn-primary');
            wallToggleActiveBtn.classList.add('btn-danger');
            showMessage(wallStatusDisplay, '留言墙已关闭，用户无法发送消息', false);
        } else {
            wallStatusDisplay.classList.remove('status-pending');
            wallStatusDisplay.classList.add('status-active');
            wallStatusDisplay.textContent = '留言墙状态: 开启';
            wallToggleActiveBtn.textContent = '关闭留言墙';
            wallToggleActiveBtn.classList.remove('btn-danger');
            wallToggleActiveBtn.classList.add('btn-primary');
            showMessage(wallStatusDisplay, '留言墙已开启，用户可以发送消息', false);
        }
        // In real app, this would be an API call to backend to update GameSession or Wall settings
    });

    // Update initial state of wall view if selected
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.dataset.view === 'wall-messages' && currentSessionId) {
                fetchPendingMessages();
                fetchApprovedMessages();
            }
        });
    });

    // Initial load for dashboard (existing sessions) should now also load wall-specific data if available
    const originalLoadInitialDashboard = loadInitialDashboard;
    loadInitialDashboard = async () => {
        await originalLoadInitialDashboard();
        // If auto-selected game control, also fetch wall messages if on that view
        if (currentSessionId && document.getElementById('wall-messages-view').classList.contains('active')) {
            fetchPendingMessages();
            fetchApprovedMessages();
        }
    }
    loadInitialDashboard();
        } catch (error) {
            showMessage(gameCurrentStatusDisplay, `结束会话失败: ${error.message}`, true);
        }
    });


    // Initial setup on page load
    async function loadInitialDashboard() {
        authToken = localStorage.getItem('authToken');
        if (authToken) {
            loginView.classList.add('hidden');
            mainContent.classList.remove('hidden');

            // Fetch list of existing sessions
            try {
                // Assuming an API endpoint to get all sessions hosted by the current user
                // For this mockup, we'll start with an empty list
                const sessions = await apiRequest('/game/sessions', 'GET'); // Placeholder API, will need to be created
                sessionListContainer.innerHTML = '<h3>现有会话</h3>'; // Clear mock sessions
                if (sessions && sessions.length > 0) {
                    sessions.forEach(session => {
                        addSessionCardToDashboard(session.id, session.qrCodeUrl, session.status);
                    });
                    // Set the last active session as default
                    currentSessionId = sessions[sessions.length - 1].id;
                } else {
                    sessionListContainer.innerHTML += '<p>当前没有游戏会话。</p>';
                }

                // If a session is auto-selected, update display
                if (currentSessionId) {
                    navItems.forEach(ni => ni.classList.remove('active'));
                    document.querySelector('[data-view="game-control"]').classList.add('active');
                    views.forEach(view => view.classList.remove('active'));
                    document.getElementById('game-control-view').classList.add('active');
                    await fetchSessionState(currentSessionId);
                    initWebSocket();
                } else {
                    // Default to dashboard view if no sessions
                    navItems.forEach(ni => ni.classList.remove('active'));
                    document.querySelector('[data-view="dashboard"]').classList.add('active');
                    views.forEach(view => view.classList.remove('active'));
                    document.getElementById('dashboard-view').classList.add('active');
                }

            } catch (error) {
                showMessage(loginStatus, `加载会话列表失败: ${error.message}`, true);
                // If fetching sessions fails, something is wrong with auth or backend, force re-login
                localStorage.removeItem('authToken');
                loginView.classList.remove('hidden');
                mainContent.classList.add('hidden');
            }

        } else {
            loginView.classList.remove('hidden');
            mainContent.classList.add('hidden');
        }
    }

    loadInitialDashboard(); // Run on page load
});