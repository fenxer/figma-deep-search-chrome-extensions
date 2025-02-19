console.log('【Debug】内容脚本开始加载');

// 存储最后处理的 URL 和时间
let lastProcessedUrl = '';
let lastProcessTime = 0;
const PROCESS_COOLDOWN = 2000; // 2秒冷却时间

// 存储当前观察器
let currentObserver = null;

// 处理搜索结果
function processSearchResults(response) {
  if (!response.meta || !response.meta.results) {
    console.log('【Debug】没有搜索结果数据');
    return;
  }

  console.log('【Debug】开始处理搜索结果，结果数量:', response.meta.results.length);

  // 使用递归方式尝试多次查找 DOM 元素
  function tryProcessResults(attempts = 0) {
    if (attempts >= 10) {
      console.log('【Debug】达到最大重试次数，放弃处理');
      return;
    }

    const gridCells = document.querySelectorAll('[role="gridcell"]');
    console.log('【Debug】找到的 gridCell 数量:', gridCells.length);

    if (gridCells.length === 0) {
      console.log(`【Debug】第 ${attempts + 1} 次尝试：未找到 gridCells，将在 200ms 后重试`);
      setTimeout(() => tryProcessResults(attempts + 1), 200);
      return;
    }

    response.meta.results.forEach((result, index) => {
      console.log(`【Debug】处理第 ${index + 1} 个结果`);
      
      const cell = gridCells[index];
      if (!cell) {
        console.log(`【Debug】未找到第 ${index + 1} 个 gridCell`);
        return;
      }

      const targetContainer = cell.querySelector('.cx_flex--2hUIC.cx_flexColumn--DyM3M.cx_flexShrink1--zlAUs.cx_flexGrow1--JL8fV.cx_wFull--sGUhp.cx_overflowHidden--NE-Hr');
      if (!targetContainer) {
        console.log(`【Debug】未找到第 ${index + 1} 个结果的目标容器`);
        console.log('【Debug】当前 cell 的 HTML:', cell.innerHTML);
        return;
      }

      // 检查是否已经添加过标签
      const existingTags = targetContainer.querySelector('.deep-search-tag-container');
      if (existingTags) {
        console.log(`【Debug】第 ${index + 1} 个结果已有标签，跳过`);
        return;
      }

      // 创建标签容器
      const tagContainer = document.createElement('div');
      tagContainer.className = 'deep-search-tag-container';

      // 添加标签
      const matchedQueries = result.matched_queries || {};
      console.log(`【Debug】第 ${index + 1} 个结果的匹配查询:`, matchedQueries);

      // 定义标签映射关系
      const tagMappings = {
        'deep-search-text': { type: 'text', label: '内部文本' },
        'frame-name': { type: 'frame', label: 'Frame 标题' },
        'fuzzy-name': { type: 'file', label: '文件标题' },
        'page-name': { type: 'page', label: 'Page 标题' }
      };

      let addedTags = 0;
      const tags = [];
      
      // 如果 matchedQueries 是数组
      if (Array.isArray(matchedQueries)) {
        Object.entries(tagMappings).forEach(([queryType, { type, label }]) => {
          if (matchedQueries.includes(queryType)) {
            const tag = document.createElement('span');
            tag.className = `deep-search-tag ${type}`;
            tag.textContent = label;
            tag.dataset.type = type;
            tag.dataset.fileId = result.model?.key || '';
            tagContainer.appendChild(tag);
            addedTags++;
            tags.push({ type, label });
            console.log(`【Debug】为第 ${index + 1} 个结果添加标签 (数组模式):`, label);
          }
        });
      } 
      // 如果 matchedQueries 是对象
      else {
        Object.entries(tagMappings).forEach(([queryType, { type, label }]) => {
          if (matchedQueries[queryType]) {
            const tag = document.createElement('span');
            tag.className = `deep-search-tag ${type}`;
            tag.textContent = label;
            tag.dataset.type = type;
            tag.dataset.fileId = result.model?.key || '';
            tagContainer.appendChild(tag);
            addedTags++;
            tags.push({ type, label });
            console.log(`【Debug】为第 ${index + 1} 个结果添加标签 (对象模式):`, label);
          }
        });
      }

      // 如果有标签，添加到目标容器并设置点击事件
      if (addedTags > 0) {
        targetContainer.appendChild(tagContainer);
        console.log(`【Debug】成功为第 ${index + 1} 个结果添加了 ${addedTags} 个标签`);

        // 创建弹窗容器
        const popupContainer = document.createElement('div');
        popupContainer.className = 'deep-search-popup';
        tagContainer.appendChild(popupContainer);

        // 为每个标签添加点击事件
        tagContainer.querySelectorAll('.deep-search-tag').forEach(tag => {
          const clickHandler = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 移除其他标签的 active 状态
            document.querySelectorAll('.deep-search-tag').forEach(t => {
              if (t !== tag) {
                t.classList.remove('active');
              }
            });

            // 添加加载状态
            const originalText = tag.textContent;
            tag.textContent = originalText + '...';
            tag.classList.add('active');

            // 检查扩展上下文是否有效
            if (!chrome.runtime?.id) {
              console.log('【Debug】扩展上下文无效，尝试重新连接');
              safeReconnect();
              alert('扩展需要重新加载，请刷新页面重试');
              return;
            }

            const searchQuery = new URLSearchParams(window.location.search).get('q');
            const fileId = tag.dataset.fileId;
            const tagType = tag.dataset.type;

            // 从 result 中获取 editor_type
            const editorType = result.model.editor_type === 'whiteboard' ? 'board' : result.model.editor_type || 'design';
            
            console.log('【Debug】标签被点击:', { searchQuery, fileId, tagType, tags, editorType });

            // 如果是 slides 类型，显示提示并返回
            if (editorType === 'slides') {
              // 显示结果
              popupContainer.innerHTML = '<div class="deep-search-popup-item"><p class="deep-search-popup-text">slides 文件不支持查询</p></div>';
              
              // 显示弹窗
              document.querySelectorAll('.deep-search-popup').forEach(popup => {
                popup.classList.remove('active');
              });
              popupContainer.classList.add('active');

              // 计算弹窗位置
              const tagRect = tag.getBoundingClientRect();
              const popupWidth = 320;
              const viewportWidth = window.innerWidth;

              // 计算左侧位置，确保不超出视口
              let left = tagRect.left;
              if (left + popupWidth > viewportWidth) {
                left = viewportWidth - popupWidth - 16;
              }
              if (left < 16) {
                left = 16;
              }

              // 点击其他地方关闭弹窗
              const closePopup = (e) => {
                if (!popupContainer.contains(e.target) && !tag.contains(e.target)) {
                  popupContainer.classList.remove('active');
                  document.removeEventListener('click', closePopup);
                }
              };
              
              // 延迟添加点击事件，避免立即触发
              setTimeout(() => {
                document.addEventListener('click', closePopup);
              }, 0);

              return;
            }

            // 获取 token（添加重试机制）
            let token;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
              try {
                if (!chrome.runtime?.id) {
                  throw new Error('Extension context invalidated');
                }

                token = await new Promise((resolve, reject) => {
                  chrome.storage.local.get(['figmaToken'], (result) => {
                    if (chrome.runtime.lastError) {
                      reject(chrome.runtime.lastError);
                      return;
                    }
                    resolve(result.figmaToken || '');
                  });
                });

                if (token) break;
                
                retryCount++;
                if (retryCount < maxRetries) {
                  console.log(`【Debug】获取 token 重试 ${retryCount}/${maxRetries}`);
                  await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                }
              } catch (error) {
                console.log('【Debug】获取 token 失败:', error);
                if (error.message.includes('Extension context invalidated')) {
                  safeReconnect();
                  alert('扩展需要重新加载，请刷新页面重试');
                  return;
                }
                
                retryCount++;
                if (retryCount === maxRetries) {
                  alert('获取 token 失败，请检查扩展是否正常运行');
                  return;
                }
                
                await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
              }
            }

            if (!token) {
              // 显示结果
              popupContainer.innerHTML = '<div class="deep-search-popup-item"><p class="deep-search-popup-text">当前尚未输入 Figma Personal Access Token，点击插件图标输入后，可查看搜素关键词在文件内的位置</p></div>';
              
              // 显示弹窗
              document.querySelectorAll('.deep-search-popup').forEach(popup => {
                popup.classList.remove('active');
              });
              popupContainer.classList.add('active');

              // 计算弹窗位置
              const tagRect = tag.getBoundingClientRect();
              const popupWidth = 320;
              const viewportWidth = window.innerWidth;

              // 计算左侧位置，确保不超出视口
              let left = tagRect.left;
              if (left + popupWidth > viewportWidth) {
                left = viewportWidth - popupWidth - 16;
              }
              if (left < 16) {
                left = 16;
              }

              // 点击其他地方关闭弹窗
              const closePopup = (e) => {
                if (!popupContainer.contains(e.target) && !tag.contains(e.target)) {
                  popupContainer.classList.remove('active');
                  document.removeEventListener('click', closePopup);
                }
              };
              
              // 延迟添加点击事件，避免立即触发
              setTimeout(() => {
                document.addEventListener('click', closePopup);
              }, 0);

              return;
            }

            try {
              // 获取文件数据
              const response = await fetch(`https://api.figma.com/v1/files/${fileId}`, {
                headers: {
                  'X-FIGMA-TOKEN': token
                }
              });

              if (!response.ok) {
                throw new Error('Figma API request failed');
              }

              const data = await response.json();
              
              // 恢复原始文本
              tag.textContent = originalText;
              
              // 处理搜索结果
              const results = [];
              const searchRegex = new RegExp(searchQuery, 'i');

              const processNode = (node) => {
                if (!node) return;

                const matchesName = node.name && searchRegex.test(node.name);
                const matchesCharacters = node.characters && searchRegex.test(node.characters);

                if (matchesName || matchesCharacters) {
                  const isValidType = (
                    (tagType === 'text' && node.type === 'TEXT') ||
                    (tagType === 'frame' && ['FRAME', 'GROUP'].includes(node.type)) ||
                    (tagType === 'page' && node.type === 'CANVAS')
                  );

                  if (isValidType) {
                    results.push({
                      id: node.id,
                      text: matchesCharacters ? node.characters : node.name
                    });
                  }
                }

                if (node.children) {
                  node.children.forEach(processNode);
                }
              };

              processNode(data.document);

              // 显示结果
              popupContainer.innerHTML = '';
              
              if (tagType === 'file') {
                popupContainer.innerHTML = '<div class="deep-search-popup-item"><p class="deep-search-popup-text">该设计文件标题中包含搜索关键词</p></div>';
              } else {
                results.forEach(result => {
                  const nodeId = result.id.replace(':', '-');
                  const url = `https://www.figma.com/${editorType}/${fileId}?node-id=${nodeId}`;
                  
                  const itemHtml = `
                    <a href="${url}" class="deep-search-popup-item" target="_blank">
                      <p class="deep-search-popup-text">> ${result.text}</p>
                    </a>
                  `;
                  popupContainer.innerHTML += itemHtml;
                });
              }

              // 显示弹窗
              document.querySelectorAll('.deep-search-popup').forEach(popup => {
                popup.classList.remove('active');
              });
              popupContainer.classList.add('active');

              // 点击其他地方关闭弹窗和移除 active 状态
              const closePopup = (e) => {
                if (!popupContainer.contains(e.target) && !tag.contains(e.target)) {
                  popupContainer.classList.remove('active');
                  tag.classList.remove('active');
                  document.removeEventListener('click', closePopup);
                }
              };
              
              // 延迟添加点击事件，避免立即触发
              setTimeout(() => {
                document.addEventListener('click', closePopup);
              }, 0);

            } catch (error) {
              console.error('【Debug】获取 Figma 数据失败:', error);
              // 恢复原始文本和移除 active 状态
              tag.textContent = originalText;
              tag.classList.remove('active');
              alert('获取 Figma 数据失败，请检查 token 是否正确');
            }
          };

          // 移除旧的事件监听器（如果存在）
          tag.removeEventListener('click', clickHandler);
          // 添加新的事件监听器
          tag.addEventListener('click', clickHandler);
        });
      } else {
        console.log(`【Debug】第 ${index + 1} 个结果没有匹配的查询类型，原始数据:`, matchedQueries);
      }
    });
  }

  // 开始处理结果
  tryProcessResults();
}

// 创建一个新的 MutationObserver 实例
function createObserver() {
  const observer = new MutationObserver((mutations) => {
    // 使用 requestAnimationFrame 来确保在下一帧处理，避免同步错误
    window.requestAnimationFrame(() => {
      try {
        handleDOMMutations(mutations);
      } catch (error) {
        console.error('【Debug】处理 DOM 变化时出错:', error);
        // 如果是扩展上下文失效，尝试重新连接
        if (error.message.includes('Extension context invalidated')) {
          safeReconnect();
        }
      }
    });
  });

  currentObserver = observer;
  return observer;
}

// 处理 DOM 变化
function handleDOMMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      const gridCells = document.querySelectorAll('[role="gridcell"]');
      if (gridCells.length > 0) {
        console.log('【Debug】检测到搜索结果加载，gridCells 数量:', gridCells.length);
        notifyBackground();
        break;
      }
    }
  }
}

// 安全地通知后台
function notifyBackground() {
  if (!chrome.runtime?.id) {
    console.log('【Debug】扩展上下文无效，尝试重新连接');
    safeReconnect();
    return;
  }

  chrome.runtime.sendMessage({ type: 'SEARCH_RESULTS_LOADED' })
    .catch(error => {
      console.log('【Debug】发送消息失败:', error);
      if (error.message.includes('Extension context invalidated')) {
        safeReconnect();
      }
    });
}

// 安全地重新连接
function safeReconnect() {
  try {
    // 清理旧的观察器
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }

    // 延迟重新设置
    setTimeout(() => {
      if (!chrome.runtime?.id) {
        console.log('【Debug】扩展仍然无效，稍后重试');
        setTimeout(safeReconnect, 1000);
        return;
      }
      setupObservers();
    }, 500);
  } catch (error) {
    console.error('【Debug】重新连接时出错:', error);
  }
}

// 设置消息监听器
function setupMessageListener() {
  if (!chrome.runtime?.id) {
    console.log('【Debug】扩展上下文无效，跳过消息监听器设置');
    return;
  }

  try {
    chrome.runtime.onMessage.removeListener(messageHandler);
    chrome.runtime.onMessage.addListener(messageHandler);
    console.log('【Debug】消息监听器设置完成');
  } catch (error) {
    console.log('【Debug】设置消息监听器时出错:', error);
  }
}

// 消息处理函数
async function messageHandler(message, sender, sendResponse) {
  try {
    if (message.type === 'FETCH_SEARCH_RESULTS') {
      const now = Date.now();
      
      // 检查是否是重复请求
      if (message.url === lastProcessedUrl && now - lastProcessTime < PROCESS_COOLDOWN) {
        console.log('【Debug】跳过重复请求');
        return;
      }

      console.log('【Debug】收到获取搜索结果请求');
      lastProcessedUrl = message.url;
      lastProcessTime = now;

      try {
        const response = await fetch(message.url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('【Debug】成功获取搜索结果数据');
        processSearchResults(data);
      } catch (error) {
        console.error('【Debug】获取搜索结果失败:', error);
      }
    }
  } catch (error) {
    console.error('【Debug】处理消息时出错:', error);
    // 如果是扩展上下文失效，尝试重新设置
    if (error.message.includes('Extension context invalidated')) {
      setupObservers();
    }
  }
}

// 设置所有观察器和监听器
function setupObservers() {
  if (!chrome.runtime?.id) {
    console.log('【Debug】扩展上下文无效，延迟设置');
    setTimeout(setupObservers, 1000);
    return;
  }

  try {
    // 创建并启动 DOM 观察器
    const observer = createObserver();
    observer.observe(document.body, { childList: true, subtree: true });

    // 设置消息监听器
    setupMessageListener();

    // 初始化时发送消息
    if (location.href.includes('/search')) {
      notifyBackground();
    }

    console.log('【Debug】观察器和监听器设置完成');
  } catch (error) {
    console.error('【Debug】设置观察器时出错:', error);
    setTimeout(setupObservers, 1000);
  }
}

// 检查搜索结果
function checkSearchResults() {
  const currentUrl = window.location.href;
  const currentTime = Date.now();

  // 检查是否所有结果都已经有标签
  const gridCells = document.querySelectorAll('[role="gridcell"]');
  if (gridCells.length > 0) {
    let allTagged = true;
    for (const cell of gridCells) {
      const targetContainer = cell.querySelector('.cx_flex--2hUIC.cx_flexColumn--DyM3M.cx_flexShrink1--zlAUs.cx_flexGrow1--JL8fV.cx_wFull--sGUhp.cx_overflowHidden--NE-Hr');
      if (targetContainer && !targetContainer.querySelector('.deep-search-tag-container')) {
        allTagged = false;
        break;
      }
    }
    
    if (allTagged) {
      console.log('【Debug】所有结果都已有标签，停止处理');
      return;
    }
  }

  // 检查 URL 和时间间隔
  if (currentUrl === lastProcessedUrl && (currentTime - lastProcessTime) < PROCESS_COOLDOWN) {
    return;
  }

  try {
    // 从当前 URL 中提取查询参数
    const url = new URL(currentUrl);
    const searchParams = new URLSearchParams(url.search);
    const query = searchParams.get('q');

    if (!query) {
      console.log('【Debug】无法获取查询参数');
      return;
    }

    // 构建完整的 API URL
    const apiUrl = `https://www.figma.com/api/search/full_results?query=${encodeURIComponent(query)}&sort=relevancy&desc=false&current_org_id=&is_global=true&plan_id=&plan_type=orgi&search_model_type=files&rerank=`;
    console.log('【Debug】构建的 API URL:', apiUrl);

    fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('【Debug】成功获取搜索结果数据');
        processSearchResults(data);
      })
      .catch(error => {
        console.error('【Debug】获取搜索结果失败:', error);
      });
  } catch (error) {
    console.error('【Debug】处理搜索结果时出错:', error);
  }
}

// 启动轮询
let pollInterval = null;

function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  // 每 500ms 检查一次搜索结果
  pollInterval = setInterval(() => {
    if (window.location.href.includes('/search')) {
      checkSearchResults();
    }
  }, 500);

  // 30秒后停止轮询
  setTimeout(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      console.log('【Debug】停止轮询');
    }
  }, 30000);
}

// 监听 URL 变化
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    if (currentUrl.includes('/search')) {
      console.log('【Debug】检测到搜索页面 URL 变化');
      startPolling();
    }
  }
});

// 启动 URL 观察器
urlObserver.observe(document.body, { childList: true, subtree: true });

// 初始化
if (location.href.includes('/search')) {
  console.log('【Debug】初始化搜索页面');
  startPolling();
}

console.log('【Debug】内容脚本加载完成'); 