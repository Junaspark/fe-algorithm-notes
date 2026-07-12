# 维护说明

## 新增题目

题目数据集中保存在 `data.js` 的 `window.HANDBOOK_DATA` 数组中。

新增题目时复制一条现有记录，并填写：

- `id`
- `title`
- `category`
- `status`
- `difficulty`
- `summary`
- `code`
- `complexity`
- `mistakes`
- `questions`
- `answer`（仅 Event Loop 等输出题需要）

提交并推送到 `main` 后，GitHub Actions 会自动重新部署网站。

## 建议提交信息

```text
feat: add Promise retry exercise
fix: correct Promise.any empty iterable note
docs: update mistake book
refactor: improve exercise filtering
```

## 内容规则

1. 题目通过后再标记为“已通过”。
2. 保留第一次错误的关键原因，但公开站点只放必要信息。
3. 代码默认使用最终通过版或明确标注的参考版。
4. 新增题目后同步更新错题本与能力画像。
