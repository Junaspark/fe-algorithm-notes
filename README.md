# FE Algorithm Notes

个人前端面试算法训练手册，记录 JavaScript 手写题、Promise、Event Loop、数据结构、错题与复训结果。

## 在线地址

GitHub Pages 启用后：

```text
https://junaspark.github.io/fe-algorithm-notes/
```

## 当前内容

- 19 道已练习题
- 每题最终通过版或整理后的参考实现
- 复杂度、易错点、面试追问
- Promise 边界条件错题本
- Event Loop 专项练习
- 搜索、分类筛选、深色模式、复制代码
- 移动端适配

## 本地查看

无需安装依赖：

```bash
python3 -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

也可以直接打开：

```text
index.html
```

## 首次发布

### macOS / Linux

```bash
./publish.sh
```

### Windows PowerShell

```powershell
./publish.ps1
```

也可以手动执行：

```bash
git init
git branch -M main
git remote add origin https://github.com/Junaspark/fe-algorithm-notes.git
git add .
git commit -m "feat: publish frontend algorithm handbook"
git push -u origin main
```

首次推送后，在仓库中打开：

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

以后只要推送到 `main`，`.github/workflows/pages.yml` 就会自动部署。

## 更新内容

主要题目数据位于：

```text
data.js
```

详细维护规则见：

- `CONTRIBUTING.md`
- `docs/UPDATE_GUIDE.md`

## 安全提示

不要把 GitHub 密码、Personal Access Token、SSH 私钥提交到仓库或发给他人。推荐使用 GitHub CLI、GitHub Desktop 或 SSH 在自己的设备上完成认证。
