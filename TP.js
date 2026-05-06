// == 本地图片管理器扩展 ==
// 提供 /browse-images 命令，浏览并删除 SillyTavern 本地图片

(() => {
    const SETTINGS_KEY = 'lim_browse_folder'; // 可选：记住上次浏览的文件夹

    /**
     * 等待 SillyTavern 上下文就绪
     */
    function waitForContext() {
        if (window.SillyTavern?.getContext) {
            init();
        } else {
            setTimeout(waitForContext, 300);
        }
    }

    function init() {
        const context = SillyTavern.getContext();
        if (!context) {
            console.error('[本地图片管理器] 无法获取ST上下文');
            return;
        }

        // 注册斜杠命令
        context.SlashCommandParser.addCommandObject({
            name: 'browse-images',
            aliases: ['浏览本地图片', '查看图片', '删除图片'],
            description: '浏览并管理本地角色图片文件夹',
            callback: browseImagesCommand,
            returns: '',
            args: [
                {
                    name: '角色名',
                    description: '要浏览的图片文件夹名称（角色名），不填则使用当前角色',
                    required: false
                }
            ]
        });

        console.log('[本地图片管理器] 命令 /browse-images 已注册');
    }

    /**
     * 斜杠命令回调
     */
    async function browseImagesCommand(args, msg) {
        // 确定角色名称
        let chName = args?.trim();
        if (!chName) {
            // 尝试从当前聊天获取角色名
            chName = getCurrentCharacterName();
            if (!chName) {
                if (msg?.chat_message) {
                    msg.chat_message.innerHTML = '<p style="color:#ff6666;">❌ 无法获取当前角色名，请在命令后指定角色名，例如：<code>/browse-images 雷电将军</code></p>';
                }
                return '';
            }
        }

        // 创建容器并附加到消息
        const container = createContainer();
        if (msg?.chat_message) {
            msg.chat_message.appendChild(container);
        } else {
            // 没有消息上下文时弹窗显示
            showDialog(container);
            return '';
        }

        // 显示加载状态
        container.innerHTML = renderLoading(`正在加载“${chName}”的图片列表...`);

        try {
            // 调用 SillyTavern 内置 API 获取图片列表
            const listResponse = await fetch('/api/images/list', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ ch_name: chName })
            });

            if (!listResponse.ok) {
                throw new Error(`API 返回状态 ${listResponse.status}`);
            }

            const data = await listResponse.json();

            // API 可能返回 { images: [...] } 或 { files: [...] }
            const fileList = data.images || data.files || [];

            if (!Array.isArray(fileList) || fileList.length === 0) {
                container.innerHTML = `<p>📭 “${chName}” 文件夹下没有图片。</p>`;
                return '';
            }

            // 构建图片网格
            const grid = document.createElement('div');
            grid.className = 'lim-grid';

            fileList.forEach(fileInfo => {
                // fileInfo 可能是字符串（路径）或对象（包含 name/path）
                const filePath = typeof fileInfo === 'string' ? fileInfo : (fileInfo.path || fileInfo.name);
                const fileName = typeof fileInfo === 'string'
                    ? filePath.split('/').pop()
                    : (fileInfo.name || filePath.split('/').pop());

                const card = document.createElement('div');
                card.className = 'lim-card';
                card.innerHTML = `
                    <img src="/${filePath}" loading="lazy" alt="${fileName}" />
                    <div class="lim-info">
                        <span class="lim-filename" title="${fileName}">${fileName}</span>
                        <button class="lim-delete-btn" data-path="${filePath}">删除</button>
                    </div>
                `;
                grid.appendChild(card);
            });

            container.innerHTML = '';
            container.appendChild(grid);

            // 绑定删除事件
            attachDeleteHandlers(container, chName);
        } catch (err) {
            container.innerHTML = `<p style="color:#ff6666;">❌ 加载图片列表失败: ${err.message}</p>`;
            console.error('[本地图片管理器]', err);
        }

        return '';
    }

    /**
     * 绑定删除按钮事件
     */
    function attachDeleteHandlers(container, folderName) {
        container.querySelectorAll('.lim-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = btn.dataset.path;

                if (!confirm(`⚠️ 确认永久删除图片 “${filePath}” 吗？\n此操作无法恢复。`)) {
                    return;
                }

                try {
                    const deleteResponse = await fetch('/api/images/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ path: filePath })
                    });

                    if (!deleteResponse.ok) {
                        const errData = await deleteResponse.json().catch(() => ({}));
                        throw new Error(errData.error || `删除失败 (${deleteResponse.status})`);
                    }

                    // 从界面移除卡片
                    const card = btn.closest('.lim-card');
                    if (card) card.remove();

                    // 检查是否所有卡片都被删除了
                    const remaining = container.querySelectorAll('.lim-card');
                    if (remaining.length === 0) {
                        container.innerHTML = `<p>📭 “${folderName}” 文件夹下的图片已全部删除。</p>`;
                    }

                    console.log(`[本地图片管理器] 已删除: ${filePath}`);
                } catch (err) {
                    alert(`删除失败: ${err.message}`);
                    console.error('[本地图片管理器] 删除失败:', err);
                }
            });
        });
    }

    /**
     * 获取当前聊天中的角色名（非用户）
     */
    function getCurrentCharacterName() {
        try {
            // SillyTavern 1.12+ 使用 name2
            if (SillyTavern.getContext().name2) {
                return SillyTavern.getContext().name2;
            }
            // 兼容旧版
            if (SillyTavern.getContext().characterId) {
                return SillyTavern.getContext().characterId;
            }
            // 从 chat 中查找
            const chat = SillyTavern.getContext().chat;
            if (chat) {
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (!chat[i].is_user && chat[i].name) {
                        return chat[i].name;
                    }
                }
            }
        } catch (e) { }
        return null;
    }

    /**
     * 获取 SillyTavern 的通用请求头
     */
    function getRequestHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (typeof SillyTavern.getRequestHeaders === 'function') {
            return { ...SillyTavern.getRequestHeaders(), ...headers };
        }
        return headers;
    }

    // ---------- UI 工具函数 ----------

    function createContainer() {
        const div = document.createElement('div');
        div.className = 'lim-container';
        return div;
    }

    function renderLoading(text) {
        return `<div class="lim-loading">${text}</div>`;
    }

    function showDialog(contentElement) {
        const dialog = document.createElement('dialog');
        dialog.className = 'lim-dialog';
        dialog.appendChild(contentElement);
        document.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.close();
        });
    }

    // ---------- 注入内联样式 ----------
    function injectStyles() {
        if (document.getElementById('lim-styles')) return;
        const style = document.createElement('style');
        style.id = 'lim-styles';
        style.textContent = `
            .lim-container {
                padding: 12px;
                background: var(--bg-color, #1a1a1a);
                border-radius: 10px;
                margin: 8px 0;
                max-height: 80vh;
                overflow-y: auto;
            }
            .lim-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 12px;
            }
            .lim-card {
                background: rgba(255,255,255,0.06);
                border-radius: 8px;
                overflow: hidden;
                transition: transform 0.2s;
            }
            .lim-card:hover {
                transform: scale(1.02);
            }
            .lim-card img {
                width: 100%;
                height: 150px;
                object-fit: cover;
                cursor: pointer;
                display: block;
            }
            .lim-info {
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .lim-filename {
                font-size: 0.8em;
                color: #ccc;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .lim-delete-btn {
                background: #d9534f;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 0;
                cursor: pointer;
                font-size: 0.8em;
                transition: background 0.2s;
                width: 100%;
            }
            .lim-delete-btn:hover {
                background: #c9302c;
            }
            .lim-dialog {
                border: none;
                border-radius: 10px;
                padding: 0;
                background: transparent;
                max-width: 90vw;
                max-height: 85vh;
            }
            .lim-dialog::backdrop {
                background: rgba(0,0,0,0.6);
            }
            .lim-loading {
                padding: 30px;
                text-align: center;
                color: #aaa;
            }
        `;
        document.head.appendChild(style);
    }

    // 启动
    injectStyles();
    waitForContext();
})();
