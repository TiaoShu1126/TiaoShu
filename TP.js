// ==UserScript==
// @name         SD Helper with Local Image Manager
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  支持本地图片查看、删除的 SD 助手
// @author       You
// @match        http://localhost:8000/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // 等待 SillyTavern 上下文
    const waitForST = setInterval(() => {
        if (window.SillyTavern) {
            clearInterval(waitForST);
            initExtension();
        }
    }, 500);

    function initExtension() {
        const context = SillyTavern.getContext();
        const slashParser = context.SlashCommandParser;

        // ---------- 图片列表命令 ----------
        slashParser.addCommand('list-images', (args, msg) => {
            const folder = args.trim() || 'images'; // 默认目录
            fetch('/api/plugins/local-image-manager/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder })
            })
            .then(res => res.json())
            .then(data => {
                if (data.files && data.files.length > 0) {
                    let html = '<h3>本地图片列表</h3><div style="display:flex;flex-wrap:wrap;gap:10px;">';
                    data.files.forEach(file => {
                        html += `
                            <div style="text-align:center;">
                                <img src="/images/${folder}/${file}" width="100" style="display:block;"/><br>
                                <small>${file}</small><br>
                                <button onclick="deleteLocalImage('${folder}', '${file}')">删除</button>
                            </div>`;
                    });
                    html += '</div>';
                    msg.chat_message.innerHTML = html;
                } else {
                    msg.chat_message.innerHTML = '该目录下没有图片。';
                }
            });
            return '';
        });

        // ---------- 删除图片（全局函数，供按钮调用）----------
        window.deleteLocalImage = function(folder, filename) {
            if (!confirm(`确定要删除 ${filename} 吗？`)) return;
            fetch('/api/plugins/local-image-manager/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: `${folder}/${filename}` })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('删除成功');
                    // 可选：刷新列表
                } else {
                    alert('删除失败：' + data.error);
                }
            });
        };

        console.log('[SD Helper] 本地图片管理功能已加载。');
    }
})();
