## AweiClaw-desktop 目录说明

此目录包含 AweiClaw 桌面版 EXE 的 .NET 8 WinForms + WebView2 源码。

### 文件结构

```
AweiClaw-desktop/
├── MainForm.cs              ← 核心代码：WebView2 + 虚拟主机映射 + GitHub API 代理
├── MainForm.Designer.cs     ← WinForms 设计器
├── Program.cs               ← 入口
├── AweiClaw-desktop.csproj  ← 项目配置
├── build.ps1                ← 构建准备脚本（从根目录拷贝 web 文件到 www/）
├── .gitignore               ← Git 排除规则
└── www/                     ← 前端文件（构建前需运行 build.ps1 填充）
    └── login.html           ← 桌面版登录页（修改版，登录后跳转 index.html）
```

### 构建步骤

1. **运行 `build.ps1`** — 从仓库根目录拷贝 web 文件到 `www/` 并应用桌面版补丁
   ```
   powershell -File build.ps1
   ```

2. **编译发布**
   ```
   dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true
   ```

3. **输出位置**
   ```
   bin/Release/net8.0-windows/win-x64/publish/AweiClaw.exe (~69MB)
   ```

### 技术架构

- **WebView2 虚拟主机映射**：本地 `www/` 映射为 `https://aweiclaw.app`
  → localStorage/fetch/Pyodide 全部正常工作，前端代码零修改
- **GitHub API 代理**：C# `WebResourceRequested` 拦截 `/api/github/*` → 转发到 `api.github.com`
  → 不需要 Python proxy-server
- **F12 DevTools**：运行时按 F12 打开开发者工具
- **登录流程**：无 localStorage 用户 → 重定向到 login.html → 登录/注册/GitHub OAuth → 重定向回 index.html

### 前置依赖

- .NET 8 SDK
- WebView2 Runtime（Win10/11 自带）
