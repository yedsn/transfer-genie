# 变更：为传输页增加分页

## Why
传输页会持续累积上传和下载记录，列表过长后会拉低可读性，也会让用户更难定位最近的任务。

## What Changes
- 为传输页的下载列表增加与标记页一致的分页控件
- 为传输页的上传列表增加同样的分页能力
- 分页控件显示在列表底部，并随列表内容一起滚动
- 保持现有排序、筛选和操作行为不变，只控制单页展示数量

## Impact
- Affected specs: `message-feed`
- Affected code: `frontend/main.js`, `frontend/index.html`, `frontend/styles.css`
