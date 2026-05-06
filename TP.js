// image-manager.js
// 本地图片管理 - 单文件扩展
// 引入方式：在ST扩展管理页面上传此文件，或将其放在扩展文件夹中

(function() {
    'use strict';

    // --- 配置区 ---
    // 请填写你在第一步中启动的本地服务地址
    const SERVER_URL = 'http://localhost:5499';
    // --- 配置结束 ---

    // 等待 SillyTavern 上下文可用
    function waitForContext() {
        if (window.SillyTavern && SillyTavern.getContext) {
            init();
        } else {
            setTimeout(waitForContext, 500);
        }
    }

    function init() {
        const context = SillyTavern.getContext();
        if (!context) {
            console.error('[图片管理器] 无法获取ST上下文');
            return;
        }

        // 注册斜杠命令: /browse-images
        try {
            context.SlashCommandParser.addCommandObject({
                name: 'browse-images',
                aliases: ['查看图片', '浏览本地图片'],
                description: '浏览并管理本地文件夹中的图片',
                callback: browseImagesCommand,
                returns: '',
                args: []
            });
            console.log('[图片管理器] 斜杠命令 /browse-images 已注册');
        } catch (e) {
            console.error('[图片管理器] 命令注册失败:', e);
        }

        /**
         * 斜杠命令回调：向插件所在消息框中注入图片网格
         */
        async function browseImagesCommand(args, msg) {
            const container = document.createElement('div');
            container.classList.add('lim-container');
            container.innerHTML = `<div class="lim-loading">正在从本地服务加载图片列表...</div>`;

            // 挂载到当前消息
            if (msg && msg.chat_message) {
                msg.chat_message.appendChild(container);
            } else {
                // 如果没有消息上下文，则弹窗显示
                showDialog(container);
                return '';
            }

            try {
                const response = await fetch(`${SERVER_URL}/api/images`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const files = await response.json();

                if (files.error) {
                    container.innerHTML = `<div class="lim-error">❌ 错误: ${files.error}</div>`;
                    return '';
                }

                if (files.length === 0) {
                    container.innerHTML = '<p>该目录下没有图片。</p>';
                    return '';
                }

                // 构建图片网格
                const grid = document.createElement('div');
                grid.className = 'lim-grid';

                files.forEach(filename => {
                    const card = document.createElement('div');
                    card.className = 'lim-card';
                    const imgUrl = `${SERVER_URL}/image?name=${encodeURIComponent(filename)}`;
                    card.innerHTML = `
                        <img src="${imgUrl}" loading="lazy" alt="${filename}" />
                        <div class="lim-info">
                            <span class="lim-filename" title="${filename}">${filename}</span>
                            <button class="lim-delete-btn" data-filename="${filename}">删除</button>
                        </div>
                    `;
                    grid.appendChild(card);
                });

                container.innerHTML = '';
                container.appendChild(grid);
                attachDeleteHandlers(container);
            } catch (err) {
                container.innerHTML = `<div class="lim-error">❌ 网络错误: ${err.message}<br><small>请确认本地服务已启动且配置正确</small></div>`;
            }
            return '';
        }

        /**
         * 为网格中所有删除按钮绑定事件
         */
        function attachDeleteHandlers(container) {
            container.querySelectorAll('.lim-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const filename = btn.dataset.filename;
                    if (!confirm(`⚠️ 确认永久删除图片 "${filename}" 吗？\n此操作无法恢复。`)) return;

                    try {
                        const response = await fetch(`${SERVER_URL}/api/images?name=${encodeURIComponent(filename)}`, {
                            method: 'DELETE'
                        });
                        const result = await response.json();

                        if (result.success) {
                            // 从界面移除该卡片
                            const card = btn.closest('.lim-card');
                            if (card) card.remove();

                            // 检查是否所有卡片都被删除了
                            const remainingCards = container.querySelectorAll('.lim-card');
                            if (remainingCards.length === 0) {
                                container.innerHTML = '<p>📭 该目录下图片已全部删除。</p>';
                            }
                            console.log(`[图片管理器] 已删除: ${filename}`);
                        } else {
                            alert('删除失败: ' + (result.error || '未知错误'));
                        }
                    } catch (err) {
                        alert('请求失败: ' + err.message);
                    }
                });
            });
        }

        /**
         * 弹窗显示（当命令无法绑定到消息时使用）
         */
        function showDialog(contentElement) {
            const dialog = document.createElement('dialog');
            dialog.classList.add('lim-dialog');
            dialog.appendChild(contentElement);
            document.body.appendChild(dialog);
            dialog.showModal();
            // 点击背景关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) dialog.close();
            });
        }
    }

    // --- 注入样式 ---
    function injectStyles() {
        const styleId = 'lim-custom-styles';
        if (document.getElementById(styleId)) return;

        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            .lim-container {
                padding: 10px;
                background: var(--bg-color, #1a1a1a);
                border-radius: 8px;
                margin-top: 5px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .lim-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 12px;
                margin-top: 10px;
            }
            .lim-card {
                display: flex;
                flex-direction: column;
                background: rgba(255,255,255,0.05);
                border-radius: 6px;
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
            }
            .lim-info {
                padding: 6px;
                display: flex;
                flex-direction: column;
                gap: 4px;
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
                padding: 4px 8px;
                cursor: pointer;
                font-size: 0.8em;
                transition: background 0.2s;
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
            .lim-loading, .lim-error {
                padding: 20px;
                text-align: center;
                color: #aaa;
            }
        `;
        document.head.appendChild(styleEl);
    }

    // 启动
    injectStyles();
    waitForContext();
})();
