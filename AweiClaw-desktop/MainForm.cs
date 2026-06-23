using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Windows.Forms;

namespace AweiClaw_desktop;

public partial class MainForm : Form
{
    private WebView2 webView;
    private CoreWebView2Environment? coreWebViewEnv;

    public MainForm()
    {
        InitializeComponent();

        // ── 应用图标（EXE 文件图标 + 窗口标题栏/任务栏图标） ──
        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "awei.ico");
        if (File.Exists(iconPath))
            this.Icon = new Icon(iconPath);

        // ── WebView2 控件 ──
        webView = new WebView2();
        webView.Dock = DockStyle.Fill;
        this.Controls.Add(webView);

        // ── 退出确认 ──
        this.FormClosing += OnFormClosing;

        // ── F12 打开 DevTools ──
        this.KeyPreview = true;
        this.KeyDown += (s, e) =>
        {
            if (e.KeyCode == Keys.F12)
            {
                webView.CoreWebView2?.OpenDevToolsWindow();
                e.Handled = true;
            }
        };

        // ── 初始化 WebView2（异步） ──
        InitializeWebView();
    }

    private async void InitializeWebView()
    {
        try
        {
            // 创建 WebView2 环境（保存引用供代理使用）
            coreWebViewEnv = await CoreWebView2Environment.CreateAsync();
            await webView.EnsureCoreWebView2Async(coreWebViewEnv);

            var coreWebView = webView.CoreWebView2;

            // ── 虚拟主机映射 ──
            // 把本地 www 文件夹映射为 https://aweiclaw.app
            // localStorage、fetch、iframe 等全部正常，前端代码零修改
            string wwwPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www");
            coreWebView.SetVirtualHostNameToFolderMapping(
                "aweiclaw.app",
                wwwPath,
                CoreWebView2HostResourceAccessKind.Allow
            );

            // ── GitHub API 代理 ──
            // 拦截 /api/github/* → 转发到 api.github.com，替代 Python proxy-server.py
            coreWebView.AddWebResourceRequestedFilter(
                "https://aweiclaw.app/api/github/*",
                CoreWebView2WebResourceContext.All
            );
            coreWebView.WebResourceRequested += OnGitHubApiProxy;

            // ── F12 打开 DevTools ──
            coreWebView.Settings.AreDevToolsEnabled = true;

            // ── 导航到主页面 ──
            coreWebView.Navigate("https://aweiclaw.app/index.html");

            // ── 导航完成后注入 JS 错误监控 ──
            coreWebView.NavigationCompleted += (s, args) =>
            {
                if (args.IsSuccess)
                {
                    // 检查 script.js 是否加载成功
                    coreWebView.ExecuteScriptAsync(
                        @"(function(){
                            // 拦截全局 JS 错误并记录
                            window.__aweiErrors = [];
                            window.addEventListener('error', function(e){
                                window.__aweiErrors.push(e.message + ' @ ' + e.filename + ':' + e.lineno);
                            });
                            window.addEventListener('unhandledrejection', function(e){
                                window.__aweiErrors.push('Unhandled: ' + (e.reason && e.reason.message || e.reason));
                            });
                            // 检查关键函数是否存在
                            var checks = ['switchPage','enterApp','handleLogout','sendAIMessage','showNewProjectDialog'];
                            var missing = checks.filter(function(f){ return typeof window[f] === 'undefined'; });
                            if(missing.length > 0){
                                console.error('[AweiClaw-Desktop] Missing functions: ' + missing.join(', '));
                            } else {
                                console.log('[AweiClaw-Desktop] All core functions loaded ✓');
                            }
                        })()"
                    );
                }
            };
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"WebView2 初始化失败：\n{ex.Message}\n\n请确认系统已安装 WebView2 Runtime。\n\n下载地址：https://developer.microsoft.com/microsoft-edge/webview2/#download-section",
                "AweiClaw 启动错误",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    /// <summary>
    /// GitHub API 代理：拦截前端的 /api/github/* 请求，转发到真实 GitHub API
    /// </summary>
    private void OnGitHubApiProxy(
        object? sender,
        CoreWebView2WebResourceRequestedEventArgs e
    )
    {
        try
        {
            string originalUri = e.Request.Uri;
            // https://aweiclaw.app/api/github/user/repos → https://api.github.com/user/repos
            string githubApiUrl = "https://api.github.com" +
                originalUri.Substring("https://aweiclaw.app/api/github".Length);

            using var httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Add("User-Agent", "AWEI-Studio/2.0");
            httpClient.Timeout = TimeSpan.FromSeconds(30);

            // 转发 Authorization header
            foreach (var header in e.Request.Headers)
            {
                if (header.Key == "Authorization")
                {
                    httpClient.DefaultRequestHeaders.Add("Authorization", header.Value);
                }
            }

            HttpResponseMessage githubResponse;

            if (e.Request.Method == "POST")
            {
                // 读取请求体 Stream → string
                Stream? requestStream = e.Request.Content;
                string body = "";
                if (requestStream != null)
                {
                    using var reader = new StreamReader(requestStream, Encoding.UTF8);
                    body = reader.ReadToEnd();
                }
                var content = new StringContent(
                    body,
                    Encoding.UTF8,
                    "application/x-www-form-urlencoded"
                );
                githubResponse = httpClient.PostAsync(githubApiUrl, content).Result;
            }
            else
            {
                githubResponse = httpClient.GetAsync(githubApiUrl).Result;
            }

            string responseBody = githubResponse.Content.ReadAsStringAsync().Result;
            Stream responseStream = new MemoryStream(Encoding.UTF8.GetBytes(responseBody));

            var responseHeaders =
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Access-Control-Allow-Origin: *\r\n";

            var response = coreWebViewEnv!.CreateWebResourceResponse(
                responseStream,
                (int)githubResponse.StatusCode,
                githubResponse.StatusCode.ToString(),
                responseHeaders
            );
            e.Response = response;
        }
        catch (Exception ex)
        {
            Stream errorStream = new MemoryStream(Encoding.UTF8.GetBytes(
                $"{{\"error\":\"proxy_error\",\"error_description\":\"{ex.Message}\"}}"
            ));
            var responseHeaders = "Content-Type: application/json; charset=utf-8\r\n";
            var response = coreWebViewEnv!.CreateWebResourceResponse(
                errorStream, 502, "Bad Gateway", responseHeaders
            );
            e.Response = response;
        }
    }

    /// <summary>
    /// 退出确认对话框
    /// </summary>
    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            var result = MessageBox.Show(
                "确定要退出 AweiClaw 吗？",
                "确认退出",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );
            if (result == DialogResult.No)
                e.Cancel = true;
        }
    }
}
