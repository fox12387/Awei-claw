[README.md](https://github.com/user-attachments/files/29202231/README.md)
# 🦅 AweiClaw - AI 编程助手

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Web-green?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
  <img src="https://img.shields.io/github/stars/fox12387/AweiClaw?style=flat-square&logo=github" alt="Stars">
</p>

<p align="center">
  <strong>🌟 类似 Codex 的 AI 编程助手，集成硅基流动 API，支持 6 种编程语言的智能代码提示 🌟</strong>
</p>

---

## 📖 目录

- [项目简介](#项目简介)
- [✨ 核心特性](#核心特性)
- [🎯 支持的语言](#支持的语言)
- [📥 下载安装](#下载安装)
- [🚀 快速开始](#快速开始)
- [💡 使用指南](#使用指南)
- [🛠️ 技术栈](#技术栈)
- [📸 截图预览](#截图预览)
- [🤝 贡献指南](#贡献指南)
- [📄 开源协议](#开源协议)
- [👨‍💻 作者信息](#作者信息)

---

## 🦅 项目简介

**AweiClaw** 是一款类似于 OpenAI Codex 的 AI 编程助手，旨在为开发者提供智能、高效的代码编写体验。

### 🎯 项目特色

- **🧠 智能代码提示**：集成硅基流动 API，使用 DeepSeek-R1-0528-Qwen3-8B 模型
- **⚡ 多语言支持**：支持 Python、C++、C#、HTML、CSS、JavaScript 六种主流编程语言
- **📚 丰富提示库**：每种语言配备 100 条精选快捷提示（txt 存储）
- **🎨 精美 UI**：白色背景设计，简洁优雅
- **🖥️ 双端支持**：提供 Windows 桌面版和 Web 网页版

---

## ✨ 核心特性

### 1️⃣ AI 智能补全
- 输入触发字符（如 `<!`）自动激活 AI 提示
- 快捷键 `Ctrl + Enter` 快速获取代码建议
- 基于 DeepSeek-R1 模型，代码质量高

### 2️⃣ 多语言提示库
- 每种语言内置 100 条常用代码片段
- 覆盖常见编程场景（循环、条件、函数、类等）
- 支持快速插入和自定义

### 3️⃣ Terminal 复制功能
- 一键复制代码到终端
- 支持多种终端模拟器
- 提升开发效率

### 4️⃣ 白色背景 UI
- 简洁现代的界面设计
- 护眼配色方案
- 良好的视觉体验

---

## 🎯 支持的语言

| 语言 | 文件扩展名 | 提示库大小 | 状态 |
|------|------------|------------|------|
| 🐍 Python | `.py` | 100 条 | ✅ 支持 |
| ⚙️ C++ | `.cpp`, `.h` | 100 条 | ✅ 支持 |
| 🎮 C# | `.cs` | 100 条 | ✅ 支持 |
| 🌐 HTML | `.html` | 100 条 | ✅ 支持 |
| 🎨 CSS | `.css` | 100 条 | ✅ 支持 |
| 📜 JavaScript | `.js` | 100 条 | ✅ 支持 |

---

## 📥 下载安装

### 方式一：下载 Release（推荐）

1. 前往 [Releases 页面](https://github.com/fox12387/AweiClaw/releases)
2. 下载最新版本的 `AweiClaw.exe`
3. 双击运行，无需安装

### 方式二：克隆源码编译

```bash
# 克隆仓库
git clone https://github.com/fox12387/AweiClaw.git

# 进入项目目录
cd AweiClaw/aweiclaw-launcher

# 使用 .NET 6.0+ 编译
dotnet build
dotnet run
```

### 方式三：Web 版

直接访问：[AweiClaw Web 版](https://fox12387.github.io/AweiClaw/)

---

## 🚀 快速开始

### Windows 桌面版

1. **下载并运行** `AweiClaw.exe`
2. **配置 API**：首次运行需输入硅基流动 API Key
3. **选择语言**：选择你要使用的编程语言
4. **开始编码**：输入触发字符或按 `Ctrl + Enter` 获取 AI 建议

### Web 版

1. 打开浏览器访问 Web 版地址
2. 在设置中配置 API Key
3. 选择编程语言
4. 开始享受 AI 辅助编程

---

## 💡 使用指南

### 触发 AI 提示

在代码编辑器中输入以下触发字符之一：

- HTML: `<!`
- Python: `def ` 或 `class `
- JavaScript: `function ` 或 `=>`
- 其他语言：查看对应提示库

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 获取 AI 代码建议 |
| `Ctrl + C` | 复制选中代码 |
| `Ctrl + V` | 粘贴代码 |
| `Ctrl + S` | 保存当前文件 |
| `Ctrl + /` | 注释/取消注释 |

### 提示库使用

1. 点击左侧语言标签（Python、C++、C#、HTML、CSS、JS）
2. 浏览该语言的 100 条提示
3. 点击任意提示，自动插入到编辑器

---

## 🛠️ 技术栈

### 桌面版 (aweiclaw-launcher)

- **框架**: .NET 6.0+
- **语言**: C#
- **UI**: Windows Forms / WPF
- **API**: 硅基流动 (SiliconFlow)

### Web 版 (aweiclaw-site)

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **样式**: 原生 CSS (白色背景主题)
- **API**: Fetch API (硅基流动)

### AI 模型

- **模型**: DeepSeek-R1-0528-Qwen3-8B
- **提供商**: 硅基流动 (SiliconFlow)
- **API 文档**: [SiliconFlow API](https://platform.siliconflow.cn/)

---

## 📸 截图预览

> 📷 **截图占位符** - 请在下方添加你的应用截图

### 主界面

```
┌─────────────────────────────────────┐
│  AweiClaw - AI 编程助手           │
├─────────────────────────────────────┤
│  [语言选择] [提示库] [设置]        │
├─────────────────────────────────────┤
│                                     │
│  代码编辑器区域                      │
│  (支持语法高亮)                     │
│                                     │
├─────────────────────────────────────┤
│  AI 建议面板                        │
│  (智能代码补全)                     │
└─────────────────────────────────────┘
```

### 提示库界面

- 🐍 Python: 100 条提示
- ⚙️ C++: 100 条提示
- 🎮 C#: 100 条提示
- 🌐 HTML: 100 条提示
- 🎨 CSS: 100 条提示
- 📜 JavaScript: 100 条提示

---

## 🤝 贡献指南

我们欢迎任何形式的贡献！

### 如何贡献

1. **Fork 本仓库**
2. **创建你的特性分支**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **提交你的更改**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **推送到分支**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **打开一个 Pull Request**

### 贡献内容

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🎨 优化 UI 设计
- 🌍 添加多语言支持
- 📚 扩充提示库

---

## 📄 开源协议

本项目采用 **MIT 协议** 开源。

- ✅ 商业使用
- ✅ 修改
- ✅ 分发
- ✅ 私人使用

查看 [LICENSE](LICENSE) 文件了解更多信息。

---

## 👨‍💻 作者信息

**🦅 AWEI 阿威工作室**

- **开发者**: Awei studio(阿威工作室)
- **GitHub**: [@fox12387](https://github.com/fox12387)
- **工作室**: AWEI Studio
- **项目地址**: [https://github.com/fox12387/AweiClaw](https://github.com/fox12387/AweiClaw)

---

## 🙏 致谢

- **硅基流动 (SiliconFlow)** - 提供 AI API 支持
- **DeepSeek** - 提供 R1 模型
- **所有贡献者** - 让这个项目变得更好

---

## 📞 联系方式

如果你有任何问题或建议，欢迎通过以下方式联系我们：

- 📧 **Email**: [awgzs2026@gmail.com]
- 💬 **Issues**: [GitHub Issues](https://github.com/fox12387/AweiClaw/issues)
- 🌐 **Website**: [https://awgzs.cn]

---

<div align="center">

### ⭐ 如果这个项目对你有帮助，请给它一个 Star！ ⭐

**Made with ❤️ by AWEI Studio**

</div>
