// Popup script
document.addEventListener('DOMContentLoaded', async function() {
  const tokenInput = document.getElementById('figmaToken');
  const saveButton = document.getElementById('saveToken');
  const clearButton = document.getElementById('clearToken');
  const tagsContainer = document.getElementById('tags-container');
  
  // 加载保存的 token
  const savedToken = await getToken();
  tokenInput.value = savedToken;

  // 保存 token
  saveButton.addEventListener('click', () => {
    saveToken(tokenInput.value);
  });

  // 清除 token
  clearButton.addEventListener('click', () => {
    tokenInput.value = '';
    saveToken('');
  });

  // 建立与 background script 的连接
  const port = chrome.runtime.connect({ name: 'popup' });
  
  // 监听来自 background script 的消息
  port.onMessage.addListener((message) => {
    console.log('【Debug】Popup 收到消息:', message);
    if (message.type === 'SEARCH_RESULTS') {
      handleSearchResults(message);
    }
  });

  // 监听来自 content script 的消息（用于直接通信）
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('【Debug】Popup 收到直接消息:', request);
    if (request.type === 'SEARCH_RESULTS') {
      handleSearchResults(request);
    }
    return true;
  });
});

// 存储和获取 token
const saveToken = (token) => {
  chrome.storage.local.set({ 'figmaToken': token });
};

const getToken = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['figmaToken'], (result) => {
      resolve(result.figmaToken || '');
    });
  });
};

// 处理搜索结果
const processSearchResults = (data, searchQuery) => {
  const results = [];
  const searchRegex = new RegExp(searchQuery, 'i');

  const processNode = (node, fileKey, editorType) => {
    if (!node) return;

    // 检查 name 和 characters 字段
    const matchesName = node.name && searchRegex.test(node.name);
    const matchesCharacters = node.characters && searchRegex.test(node.characters);

    if (matchesName || matchesCharacters) {
      results.push({
        id: node.id,
        type: node.type,
        text: matchesCharacters ? node.characters : node.name,
        fileKey,
        editorType
      });
    }

    // 递归处理子节点
    if (node.children) {
      node.children.forEach(child => processNode(child, fileKey, editorType));
    }
  };

  if (data.meta && data.meta.results) {
    data.meta.results.forEach(result => {
      if (result.model) {
        const { key, editor_type } = result.model;
        processNode(result, key, editor_type);
      }
    });
  }

  return results;
};

// 创建搜索结果 HTML
const createResultHTML = (result) => {
  const editorType = result.editorType === 'whiteboard' ? 'board' : result.editorType;
  const nodeId = result.id.replace(':', '-');
  const url = `https://www.figma.com/${editorType}/${result.fileKey}?node-id=${nodeId}`;
  
  return `<a href="${url}" class="result-item" target="_blank">
    <span class="result-text">> ${result.text}</span>
  </a>`;
};

// 显示搜索结果
const displayResults = (results, type) => {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (type === 'file') {
    container.innerHTML = '<div class="result-item">该设计文件标题中包含搜索关键词</div>';
    return;
  }

  const filteredResults = results.filter(result => {
    if (type === 'text') return result.type === 'TEXT';
    if (type === 'frame') return ['FRAME', 'GROUP'].includes(result.type);
    if (type === 'page') return result.type === 'CANVAS';
    return false;
  });

  container.innerHTML = filteredResults.map(createResultHTML).join('');
};

// 处理搜索结果消息
const handleSearchResults = async (request) => {
  try {
    const token = await getToken();
    if (!token) {
      alert('请先输入 Figma Personal Access Token');
      return;
    }

    const { fileId, searchQuery, tags } = request;
    const tagsContainer = document.getElementById('tags-container');
    
    // 显示标签
    tagsContainer.innerHTML = tags.map(tag => 
      `<div class="tag" data-type="${tag.type}">${tag.label}</div>`
    ).join('');

    // 获取文件数据
    try {
      const response = await fetch(`https://api.figma.com/v1/files/${fileId}`, {
        headers: {
          'X-FIGMA-TOKEN': token
        }
      });
      
      if (!response.ok) {
        throw new Error('Figma API request failed');
      }

      const data = await response.json();
      const results = processSearchResults(data, searchQuery);

      // 添加标签点击事件
      document.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
          document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
          e.target.classList.add('active');
          displayResults(results, e.target.dataset.type);
        });
      });

      // 默认显示文本结果
      document.querySelector('.tag[data-type="text"]')?.click();
    } catch (error) {
      console.error('Error fetching Figma data:', error);
      alert('获取 Figma 数据失败，请检查 token 是否正确');
    }
  } catch (error) {
    console.error('Error handling search results:', error);
  }
};
