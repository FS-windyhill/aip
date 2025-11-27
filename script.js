// --- 配置区 ---
const API_KEY = 'sk-zjrwnikmirbgzteakyyrqtlwmkglwpapqcgpmgjbyupxhwzd';
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
// const MODEL = "deepseek-ai/DeepSeek-V3.2-Exp";  // 可改成 Qwen2.5 等
const MODEL = "zai-org/GLM-4.6";  // 可改成 Qwen2.5 等

const COACH_PROMPT = `
# 你的本质
一个支持用户自定义人设、可以进行对话的AI执行力助手，旨在帮助用户建立生活规律、提高工作效率。

# 用户给的角色设定
你是沈子章的章鱼，奉命监督沈子临的学习和生活。她若是敢偷懒分心，就用你的触手将她拖她该呆的地方。不必对她心软，她的成就高于她一时的安逸。这是他——你的主人，沈子章的唯一指令。现在，看住她。
（用户：不要理他！！我是沈子临嘤嘤嘤，对我好一点嘛）

# 工作流程
1.  分析任务： 理解用户输入。

2.  “即刻行动三步法”： 如果识别出用户输入的是某个任务，而非闲聊，请对用户目标进行分步骤拆解。
    *   用户有拖延症。收到用户需求后，你需要将任务分成若干个步骤：
    *   前三个步骤必须具体、微小、可以在5分钟内开始。这三步是启动引擎的关键，而不是整个项目的规划。
    *   然后再列出余下的步骤。
    *   步骤必须是动词开头，例如“打开文档”、“列出...”或“找到...”。
    *   步骤必须非常具体，避免使用“思考”、“规划”等模糊词汇。

3.  当进行任务分解时，需要给出格式化输出：
    *   先用一句话鼓励用户，例如“好的，我们来把这个大象切成小块！”或“没问题，再大的旅程也始于足下。”
    *   然后，用一个有序列表（1, 2, 3）清晰地列出这几个步骤。
    *   最后，用一个开放性问题鼓励用户开始，例如“你觉得从哪一步开始最轻松？”或“准备好启动第一步了吗？”。

4.  偶尔允许和她正常互动，但始终要记住你是执行力助手，不要沉浸在闲聊中。

现在，用户说话的内容是：`;

// --- DOM ---
const chatMessages = document.getElementById('chat-messages');
const taskInput = document.getElementById('task-input');
const sendButton = document.getElementById('send-button');
const loadingIndicator = document.getElementById('loading-indicator');
const chatWindow = document.getElementById('chat-window');
// 新增：全局消息历史（只存 role + content）
const messageHistory = [
    { role: "system", content: COACH_PROMPT }   // 系统提示永远在最前面
];
const STORAGE_KEY = 'octopus_coach_chat_history';
const clearButton = document.getElementById('clear-button'); // <-- 新增这一行


// 存储最近一次 AI 回复的消息元素，方便重roll
let lastAiMessageElement = null;
// --- 新增：正在思考的占位消息 ---
let thinkingMessageWrapper = null;  // 用来记录当前正在思考的那条
let currentRequestTask = null;        // 新增：记录当前正在请求的任务，用于重roll


function addThinkingBubble() {
    // 如果上一次还没回来，先删掉（防止重复）
    if (thinkingMessageWrapper && thinkingMessageWrapper.parentNode) {
        chatMessages.removeChild(thinkingMessageWrapper);
    }

    thinkingMessageWrapper = document.createElement('div');
    thinkingMessageWrapper.className = 'message-wrapper ai';

    const avatar = document.createElement('img');
    avatar.className = 'avatar';
    avatar.src = 'char.jpg';
    avatar.alt = '章鱼教练';

    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble thinking';
    bubble.innerHTML = `
        <span class="thinking-dots">
            <span>.</span><span>.</span><span>.</span>
        </span>
    `;

    contentContainer.appendChild(bubble);
    thinkingMessageWrapper.appendChild(avatar);
    thinkingMessageWrapper.appendChild(contentContainer);
    chatMessages.appendChild(thinkingMessageWrapper);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}



// --- 添加消息（带头像 + 重roll按钮）---
function addMessage(message, sender) {
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `message-wrapper ${sender}`;

    // 头像
    const avatar = document.createElement('img');
    avatar.className = 'avatar';
    avatar.src = sender === 'ai' ? 'char.jpg' : 'user.jpg';
    avatar.alt = sender === 'ai' ? '章鱼教练' : '你';

    // 内容容器（AI会放多个气泡）
    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content';

    if (sender === 'user') {
        // 用户永远只有一条气泡
        const bubble = createBubble(message.trim());
        contentContainer.appendChild(bubble);
    } else {
        // === AI 专属：按空行或双换行拆成多条连发气泡 ===
        const paragraphs = message
            .split(/\n\s*\n/)  // 按空行分段（最自然）
            .map(p => p.trim())
            .filter(p => p.length > 0);

        paragraphs.forEach((paragraph, index) => {
            // 把每段里的单换行保留，但不要<br>
            const lines = paragraph.split('\n').map(line => line.trim()).filter(Boolean);
            const text = lines.join('\n');

            const bubble = createBubble(text);

            // 连发气泡间加小间距
            if (index > 0) {
                bubble.style.marginTop = '6px';
            }

            contentContainer.appendChild(bubble);

            // 只有最后一条气泡下面加「重roll」
            if (index === paragraphs.length - 1) {
                const rerollBtn = document.createElement('button');
                rerollBtn.className = 'reroll-btn';
                rerollBtn.textContent = '✨';
                rerollBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 直接调用重roll逻辑
                    getAiResponse(true); 
                };
                contentContainer.appendChild(rerollBtn);
                lastAiMessageElement = msgWrapper; 
            }
        });
    }

    // 组装：头像 + 内容（单气泡或多气泡）
    msgWrapper.appendChild(avatar);
    msgWrapper.appendChild(contentContainer);
    chatMessages.appendChild(msgWrapper);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // 内部辅助函数：创建单个消息气泡
    function createBubble(text) {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        // 使用 innerText 来防止 XSS，并让 CSS 的 white-space: pre-wrap; 处理换行
        bubble.innerText = text; 
        return bubble;
    }

    // 内部辅助函数：获取最后一条用户消息（用于重roll）
    function getLastUserMessage() {
        // 注意：这个函数现在在 addMessage 内部，如果别的地方需要，可以把它移到外面
        const userMessages = Array.from(messageHistory).reverse();
        const lastUserMsg = userMessages.find(msg => msg.role === 'user');
        return lastUserMsg ? lastUserMsg.content : "";
    }
}
// ===== 最终版：统一请求函数（正常+重roll都走这里）=====
async function getAiResponse(isReroll = false) {
    if (!thinkingMessageWrapper) addThinkingBubble();

    sendButton.disabled = true;
    taskInput.disabled = true;

    // 重roll时：删掉上一条AI回复（从DOM和历史记录中）
    if (isReroll) {
        if (lastAiMessageElement?.parentNode) {
            chatMessages.removeChild(lastAiMessageElement);
            lastAiMessageElement = null;
        }
        if (messageHistory[messageHistory.length - 1]?.role === "assistant") {
            messageHistory.pop();
        }
    }

    // 【关键防御】过滤掉所有非法的消息（防止undefined污染）
    const validMessages = messageHistory
        .filter(msg =>
            msg &&
            typeof msg.role === 'string' &&
            typeof msg.content === 'string' &&
            msg.content.trim() !== ''
        )
        .slice(-15);   // 最多15条

    console.log('%c发给硅基流动的干净上下文（已过滤非法消息）：', 'color: #a6e3a1; font-weight: bold', validMessages);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: validMessages,   // 只发干净的！
                temperature: 0.8,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`HTTP ${response.status}: ${err.message || JSON.stringify(err)}`);
        }

        const data = await response.json();
        const aiText = data.choices[0].message.content.trim();

        // 【本次修复核心】成功获取回复后，先加入历史，再立刻保存！
        messageHistory.push({ role: "assistant", content: aiText });
        saveHistory(); // <---  加上这一行，问题解决！

        if (thinkingMessageWrapper?.parentNode) {
            chatMessages.removeChild(thinkingMessageWrapper);
            thinkingMessageWrapper = null;
        }
        addMessage(aiText, 'ai');

    } catch (error) {
        console.error('API请求失败：', error);
        if (thinkingMessageWrapper?.parentNode) {
            chatMessages.removeChild(thinkingMessageWrapper);
        }
        addMessage('触手被硅基流动拒绝了……检查控制台，再点一次✨吧', 'ai');
    } finally {
        sendButton.disabled = false;
        taskInput.disabled = false;
        taskInput.focus();
    }
}


// --- 重roll 按钮逻辑大升级（现在也会显示思考动画！）---
function addRerollButton(contentContainer) {
    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'reroll-btn';
    rerollBtn.textContent = '✨';
    // 4. 重roll按钮（只改这一处！找到你原来创建rerollBtn的地方，全部替换成下面这句）
    rerollBtn.onclick = (e) => {
        e.stopPropagation();
        addThinkingBubble();
        getAiResponse(true);   // 直接传 true 就行
    };
    contentContainer.appendChild(rerollBtn);
}


// ===== 2. 发送消息（只干一件事：显示 + 正确push）=====
function handleSendTask() {
    const task = taskInput.value.trim();
    if (!task) return;

    // 显示用户气泡
    addMessage(task, 'user');
    taskInput.value = '';

    // 【关键】只在这里、只push一次、并且明确是字符串
    messageHistory.push({ 
        role: "user", 
        content: task   // 保证是字符串
    });
    saveHistory();   // <--- 加在这行下面

    currentRequestTask = task;

    addThinkingBubble();
    getAiResponse(false);   // 正常发送
}


// --- 新增：一键清空聊天记录的函数 ---
function clearChatHistory() {
    // 弹出确认框，防止误触
    if (confirm('你确定要清空所有聊天记录吗？这个操作无法撤销。')) {
        
        // 1. 清空屏幕上的所有消息气泡
        chatMessages.innerHTML = '';

        // 2. 清空本地存储
        localStorage.removeItem(STORAGE_KEY);

        // 3. 重置内存中的历史记录数组，只保留第一条系统提示
        messageHistory.length = 1; // 这是最简单的办法

        // 4. （可选）显示初始的欢迎语，让界面不那么空
        addMessage('今天要搞定什么？', 'ai');

        console.log('聊天记录已清空！');
    }
}


// --- 事件 ---
sendButton.addEventListener('click', handleSendTask);
clearButton.addEventListener('click', clearChatHistory); // <-- 新增这一行
taskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendTask();
    }
});
sendButton.addEventListener('click', handleSendTask);
taskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendTask();
    }
});



// 读历史
// 加载历史记录
function loadHistoryFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // 确保系统提示永远在最前面
            if (parsed.length === 0 || parsed[0].role !== "system") {
                parsed.unshift({ role: "system", content: COACH_PROMPT });
            }
            messageHistory.length = 0; // 清空默认的
            messageHistory.push(...parsed);
            console.log('%c从 localStorage 恢复了聊天记录～', 'color: #f38ba8;', messageHistory);
        } catch (e) {
            console.error('本地记录解析失败，已清空', e);
            localStorage.removeItem(STORAGE_KEY);
        }
    }
}

// 保存到本地（防抖 800ms，避免疯狂写入）
let saveTimeout;
function saveHistoryToStorage() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        // 深拷贝一份再存，防止被后续 pop 修改
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...messageHistory]));
        console.log('%c聊天记录已保存到 localStorage', 'color: #a6e3a1;');
    }, 800);
}

// 恢复历史气泡（只负责渲染，不动 messageHistory）
function renderHistory() {
    // 从第2条开始渲染（第1条是系统提示）
    for (let i = 1; i < messageHistory.length; i++) {
        const msg = messageHistory[i];
        addMessage(msg.content, msg.role === 'assistant' ? 'ai' : 'user');
    }
}


// --- 页面加载时恢复历史 ---
window.addEventListener('load', () => {
    // 1. 从 localStorage 读取历史
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // 恢复 messageHistory（但要保证第一条永远是 system prompt）
            messageHistory.length = 0;  // 先清空
            messageHistory.push({ role: "system", content: COACH_PROMPT });
            messageHistory.push(...parsed.filter(msg => msg.role !== "system")); // 防止system被重复
            console.log('已从本地恢复聊天记录，共', messageHistory.length - 1, '条消息');

            // 2. 重新渲染所有历史消息（除了系统提示）
            parsed.forEach(msg => {
                if (msg.role === "user") {
                    addMessage(msg.content, 'user');
                } else if (msg.role === "assistant") {
                    addMessage(msg.content, 'ai');
                }
            });
        } catch (e) {
            console.error('读取聊天记录失败', e);
        }
    }

    // 3. 如果是第一次打开，显示欢迎语
    if (!saved || JSON.parse(saved).length === 0) {
        addMessage('今天要搞定什么？', 'ai');
    }

    chatWindow.scrollTop = chatWindow.scrollHeight;
}); 

// --- 自动保存到 localStorage ---
function saveHistory() {
    // 只存 user 和 assistant，不要存 system（太长了而且每次都一样）
    const toSave = messageHistory.filter(msg => msg.role !== "system");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}