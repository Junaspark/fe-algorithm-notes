# 日常更新流程

```bash
git pull
# 修改 data.js 或页面文件
git add .
git commit -m "feat: add new exercise"
git push
```

推送成功后：

1. 打开仓库的 Actions 页面查看部署进度。
2. GitHub Pages 自动发布，无需手动上传网站。
3. 浏览器缓存未更新时，可强制刷新页面。

## 本地预览

```bash
python3 -m http.server 8080
```

访问：

```text
http://localhost:8080
```
