// Background script
console.log('【Debug】Service Worker 启动');

// 存储搜索数据
let pendingSearchData = null;

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('【Debug】Background 收到消息:', request);

  if (request.type === 'OPEN_POPUP_AND_SEARCH') {
    // 存储搜索数据
    pendingSearchData = request.data;
    
    // 打开 popup
    chrome.action.openPopup();
  }
});

// 监听 popup 连接
chrome.runtime.onConnect.addListener((port) => {
  console.log('【Debug】Popup 已连接');
  
  if (port.name === 'popup') {
    // 如果有待处理的搜索数据，发送给 popup
    if (pendingSearchData) {
      port.postMessage({
        type: 'SEARCH_RESULTS',
        ...pendingSearchData
      });
      pendingSearchData = null;
    }
  }
});

console.log('【Debug】Service Worker 配置完成');
