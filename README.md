# 小黑陪你

一个给 Kali 的独立宠物应用，主要面向 iPhone。打开就是小黑，没有其他小游戏或信件入口。支持添加到主屏幕，以独立窗口启动。

## 使用

在 iPhone 上用 Safari 打开 https://ziyangshen0510-star.github.io/Freddy/pet/ ，点「分享 → 添加到主屏幕」。已在线打开并缓存成功后可以离线使用。

- 小狗使用实际三维关节动画，会眨眼、呼吸、摇尾巴和散步。
- 可以按住小狗抚摸，或用下方按钮照顾它；点碗会走过去吃东西，抛球会追过去、叼回来。
- 睡觉可中断其他动作。照顾结果在完成动作后才记入状态，不会因连点而重复获得。
- 音效默认关闭，可在右上角打开。尊重系统「减少动态效果」设置。
- 名字、状态和相处记录只保存在当前浏览器。清除网站数据、换设备或更换浏览器会重新开始；没有账号、上传或统计。
- 不会因为离开太久而死亡或失去宠物，没有签到要求。

这是可安装的网页应用（PWA），不是 App Store 安装包，也不能悬浮在其他 App 上。系统不支持三维渲染时使用轻量外观，照顾功能仍可使用。

## 本地开发

Node.js 18+，服务端无需安装依赖，三维运行脚本已随仓库携带：

```sh
npm start
npm run check
```

默认端口为 3000，可用 `PORT` 更改。根地址会直接进入宠物应用。

三维源代码在 `pet/puppy-world.js`，改动后运行 `npm run build:puppy` 重新生成 `pet/puppy-world.bundle.js`。此构建命令使用固定版本 esbuild 0.25.5。Three.js 0.187.0 的源码和 MIT 许可证位于 `pet/vendor/`，下载来源及 SHA-512 记录在 `pet/vendor/version.json`。

修改客户端后需同步更新 HTML 中的资源版本和 `pet/sw.js` 的缓存版本，保留 `kali-little-dog-v1` 存档键。

## 独立离线文件

```sh
python3 scripts/export-offline.py
```

生成 checkout 旁 `Freddy-deliverables/Little-Black-Offline.html`。图片、三维脚本与界面均在一个文件中，适合电脑浏览器离线打开。文件版无法添加为 iPhone 主屏幕 PWA；手机请用上面的 HTTPS 网址。

## 发布

静态文件已配置发布到此仓库的 `gh-pages` 分支，GitHub Pages 会自动构建。推送成功不等于部署成功；应检查 GitHub Actions 的 Pages 发布任务。

逐步改进记录与后续计划见 [UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md)。目前没有配置后台每日自动升级。
