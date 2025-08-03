document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loadingDiv = document.getElementById('loading');
    const controlsDiv = document.getElementById('controls');
    const managerDiv = document.getElementById('manager');
    const statusMessage = document.getElementById('status-message');

    const viewByChannelBtn = document.getElementById('view-by-channel');
    const viewByUserBtn = document.getElementById('view-by-user');
    const channelView = document.getElementById('channel-view');
    const userView = document.getElementById('user-view');

    const createChannelForm = document.getElementById('create-channel-form');
    const newChannelNameInput = document.getElementById('new-channel-name');
    const isPrivateCheckbox = document.getElementById('is-private');

    const channelList = document.getElementById('channel-list');
    const editorChannelName = document.getElementById('editor-channel-name');
    const editorChannelInfo = document.getElementById('editor-channel-info');
    const userSelectionArea = document.getElementById('user-selection-area');
    const syncChannelButton = document.getElementById('sync-channel-button');
    const archiveChannelButton = document.getElementById('archive-channel-button');

    const userList = document.getElementById('user-list');
    const editorUserName = document.getElementById('editor-user-name');
    const channelSelectionArea = document.getElementById('channel-selection-area');
    const syncUserButton = document.getElementById('sync-user-button');

    // 【新增】全選 Checkbox 元素
    const userSelectAllContainer = document.getElementById('user-select-all-container');
    const selectAllUsersCheckbox = document.getElementById('select-all-users');
    const channelSelectAllContainer = document.getElementById('channel-select-all-container');
    const selectAllChannelsCheckbox = document.getElementById('select-all-channels');


    // --- State Management ---
    let state = {
        users: [],
        channels: [],
        selectedChannelId: null,
        selectedUserId: null,
    };

    // --- Functions ---

    function showStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.className = isError ? 'error visible' : 'success visible';
        setTimeout(() => {
            statusMessage.className = '';
        }, 5000);
    }

    async function fetchData() {
        loadingDiv.textContent = '正在從 Slack 讀取資料...';
        loadingDiv.classList.remove('hidden');
        managerDiv.classList.add('hidden'); // 讀取時隱藏舊資料
        try {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            const data = await response.json();
            
            state.users = data.users;
            state.channels = data.channels;

            renderAll();
            
            controlsDiv.classList.remove('hidden');
            managerDiv.classList.remove('hidden');

        } catch (error) {
            loadingDiv.textContent = `無法載入資料: ${error.message}`;
            showStatus('無法載入資料，請檢查後端服務是否正常以及 Slack Token 是否正確。', true);
        } finally {
            loadingDiv.classList.add('hidden');
        }
    }

    function renderAll() {
        // 保存當前選擇的 ID
        const currentChannelId = state.selectedChannelId;
        const currentUserId = state.selectedUserId;

        renderChannelList();
        renderUserList();

        // 嘗試恢復選擇
        if (currentChannelId && state.channels.some(c => c.id === currentChannelId)) {
            renderUserSelectionForChannel(currentChannelId);
        } else {
            // 如果舊選擇的頻道沒了（例如被封存），則清空右側面板
            editorChannelName.textContent = '請選擇一個頻道';
            editorChannelInfo.textContent = '';
            userSelectionArea.innerHTML = '';
            syncChannelButton.classList.add('hidden');
            archiveChannelButton.classList.add('hidden');
            userSelectAllContainer.classList.add('hidden');
        }
        
        if (currentUserId && state.users.some(u => u.id === currentUserId)) {
            renderChannelSelectionForUser(currentUserId);
        } else {
            editorUserName.textContent = '請選擇一位人員';
            channelSelectionArea.innerHTML = '';
            syncUserButton.classList.add('hidden');
            channelSelectAllContainer.classList.add('hidden');
        }
    }

    function renderChannelList() {
        channelList.innerHTML = '';
        state.channels.forEach(channel => {
            const li = document.createElement('li');
            li.dataset.channelId = channel.id;
            li.textContent = `${channel.name} ${channel.is_private ? ' (私人)' : ''}`;
            if (channel.id === state.selectedChannelId) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                state.selectedChannelId = channel.id;
                renderChannelList();
                renderUserSelectionForChannel(channel.id);
            });
            channelList.appendChild(li);
        });
    }

    function renderUserSelectionForChannel(channelId) {
        const channel = state.channels.find(c => c.id === channelId);
        if (!channel) return;

        editorChannelName.textContent = channel.name;
        editorChannelInfo.textContent = `ID: ${channel.id} | ${channel.is_private ? '私人頻道' : '公開頻道'}`;
        userSelectionArea.innerHTML = '';
        
        const currentMembers = new Set(channel.members);
        let allChecked = true;

        state.users.forEach(user => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = user.id;
            checkbox.id = `user-${user.id}`;
            checkbox.checked = currentMembers.has(user.id);
            if (!checkbox.checked) allChecked = false;
            
            // 【新增】監聽單個 checkbox 的變化，來更新「全選」的狀態
            checkbox.addEventListener('change', () => {
                const allUserCheckboxes = userSelectionArea.querySelectorAll('input[type="checkbox"]');
                const areAllChecked = Array.from(allUserCheckboxes).every(cb => cb.checked);
                selectAllUsersCheckbox.checked = areAllChecked;
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${user.name}`));
            userSelectionArea.appendChild(label);
        });
        
        // 【新增】更新並顯示「全選」勾選框
        selectAllUsersCheckbox.checked = allChecked;
        userSelectAllContainer.classList.remove('hidden');

        syncChannelButton.classList.remove('hidden');
        archiveChannelButton.classList.remove('hidden');
    }

    async function handleSyncChannel() {
        // ... 此函式內部邏輯不變，但在 finally 中刷新資料
        if (!state.selectedChannelId) return;
        const selectedUserIds = Array.from(userSelectionArea.querySelectorAll('input:checked')).map(cb => cb.value);
        syncChannelButton.disabled = true;
        syncChannelButton.textContent = '同步中...';
        try {
            const response = await fetch('/api/update_memberships', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: state.selectedChannelId, target_member_ids: selectedUserIds })
            });
            const result = await response.json();
            if (!result.ok) throw new Error(result.error || 'Unknown error');
            showStatus(`頻道 ${editorChannelName.textContent} 的成員已成功同步！`);
            await fetchData(); // 【修改】成功後刷新所有資料
        } catch (error) {
            showStatus(`同步失敗: ${error.message}`, true);
        } finally {
            syncChannelButton.disabled = false;
            syncChannelButton.textContent = '同步成員至 Slack';
        }
    }

    function renderUserList() {
        userList.innerHTML = '';
        state.users.forEach(user => {
            const li = document.createElement('li');
            li.dataset.userId = user.id;
            li.textContent = user.name;
            if (user.id === state.selectedUserId) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                state.selectedUserId = user.id;
                renderUserList();
                renderChannelSelectionForUser(user.id);
            });
            userList.appendChild(li);
        });
    }

    function renderChannelSelectionForUser(userId) {
        const user = state.users.find(u => u.id === userId);
        if (!user) return;

        editorUserName.textContent = user.name;
        channelSelectionArea.innerHTML = '';
        let allChecked = true;

        state.channels.forEach(channel => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = channel.id;
            checkbox.id = `channel-${channel.id}`;
            checkbox.checked = channel.members.includes(userId);
            if (!checkbox.checked) allChecked = false;
            
            // 【新增】監聽單個 checkbox 的變化，來更新「全選」的狀態
            checkbox.addEventListener('change', () => {
                const allChannelCheckboxes = channelSelectionArea.querySelectorAll('input[type="checkbox"]');
                const areAllChecked = Array.from(allChannelCheckboxes).every(cb => cb.checked);
                selectAllChannelsCheckbox.checked = areAllChecked;
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${channel.name} ${channel.is_private ? '(私人)' : ''}`));
            channelSelectionArea.appendChild(label);
        });

        // 【新增】更新並顯示「全選」勾選框
        selectAllChannelsCheckbox.checked = allChecked;
        channelSelectAllContainer.classList.remove('hidden');
        syncUserButton.classList.remove('hidden');
    }

    async function handleSyncUser() {
        // ... 此函式內部邏輯不變，但在 finally 中刷新資料
        if (!state.selectedUserId) return;
        syncUserButton.disabled = true;
        syncUserButton.textContent = '同步中...';
        const selectedChannelIds = new Set(Array.from(channelSelectionArea.querySelectorAll('input:checked')).map(cb => cb.value));
        let successCount = 0;
        let errorCount = 0;
        try {
            const updatePromises = state.channels.map(async (channel) => {
                const userIsInChannel = channel.members.includes(state.selectedUserId);
                const userShouldBeInChannel = selectedChannelIds.has(channel.id);
                if (userIsInChannel !== userShouldBeInChannel) {
                    const newMembers = new Set(channel.members);
                    if (userShouldBeInChannel) {
                        newMembers.add(state.selectedUserId);
                    } else {
                        newMembers.delete(state.selectedUserId);
                    }
                    try {
                        const response = await fetch('/api/update_memberships', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channel_id: channel.id, target_member_ids: Array.from(newMembers) })
                        });
                        const result = await response.json();
                        if (!result.ok) throw new Error(result.error);
                        successCount++;
                    } catch (e) {
                        console.error(`Failed to update channel ${channel.name}:`, e);
                        errorCount++;
                    }
                }
            });
            await Promise.all(updatePromises);
            showStatus(`同步完成！成功更新 ${successCount} 個頻道，失敗 ${errorCount} 個。`);
            await fetchData(); // 【修改】成功後刷新所有資料
        } catch (error) {
            showStatus(`同步失敗: ${error.message}`, true);
        } finally {
            syncUserButton.disabled = false;
            syncUserButton.textContent = '同步頻道至 Slack';
        }
    }
    
    async function handleArchiveChannel() {
        // ... 此函式內部邏輯不變，但在 finally 中刷新資料
        if (!state.selectedChannelId) return;
        const channel = state.channels.find(c => c.id === state.selectedChannelId);
        if (!confirm(`您確定要封存頻道 #${channel.name} 嗎？此操作無法輕易復原！`)) return;
        archiveChannelButton.disabled = true;
        archiveChannelButton.textContent = '封存中...';
        try {
            const response = await fetch('/api/archive_channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: state.selectedChannelId })
            });
            const result = await response.json();
            if (!result.ok) throw new Error(result.error);
            showStatus(`頻道 #${channel.name} 已成功封存！`);
            state.selectedChannelId = null; // 清除選擇
            await fetchData(); // 【修改】成功後刷新所有資料
        } catch (error) {
            showStatus(`封存失敗: ${error.message}`, true);
        } finally {
            archiveChannelButton.disabled = false;
            archiveChannelButton.textContent = '封存此頻道';
        }
    }

    // --- Event Listeners ---
    viewByChannelBtn.addEventListener('click', () => {
        channelView.classList.remove('hidden');
        userView.classList.add('hidden');
        viewByChannelBtn.classList.add('active');
        viewByUserBtn.classList.remove('active');
    });

    viewByUserBtn.addEventListener('click', () => {
        channelView.classList.add('hidden');
        userView.classList.remove('hidden');
        viewByChannelBtn.classList.remove('active');
        viewByUserBtn.classList.add('active');
    });

    createChannelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const channelName = newChannelNameInput.value.trim();
        const button = e.target.querySelector('button');
        if (!channelName) return;
        button.disabled = true;
        try {
            const response = await fetch('/api/create_channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: channelName, is_private: isPrivateCheckbox.checked })
            });
            const result = await response.json();
            if (!result.ok) throw new Error(result.error);
            showStatus(`頻道 #${result.channel.name} 已成功建立！`);
            createChannelForm.reset();
            await fetchData(); // 【修改】成功後刷新所有資料
        } catch(error) {
            showStatus(`建立頻道失敗: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    });

    // 【新增】全選功能的事件監聽
    selectAllUsersCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const allUserCheckboxes = userSelectionArea.querySelectorAll('input[type="checkbox"]');
        allUserCheckboxes.forEach(cb => cb.checked = isChecked);
    });

    selectAllChannelsCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const allChannelCheckboxes = channelSelectionArea.querySelectorAll('input[type="checkbox"]');
        allChannelCheckboxes.forEach(cb => cb.checked = isChecked);
    });

    syncChannelButton.addEventListener('click', handleSyncChannel);
    syncUserButton.addEventListener('click', handleSyncUser);
    archiveChannelButton.addEventListener('click', handleArchiveChannel);

    // --- Initial Load ---
    fetchData();
});