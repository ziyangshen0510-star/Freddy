# 宝宝，小黑在。 & Kali 的小小狗窝

小黑写给 Kali 的互动道歉小网站，以及一个简单的手机宠物小软件。奶油色与薄荷绿的手账画面、原创 SVG 黑色拉布拉多插画，支持手机和电脑。

## 运行

需要 Node.js 18 或以上，不用安装任何依赖。

```sh
cd /workspace/Freddy
npm start
```

默认端口为 3000，可以用 `PORT` 更改。也可以直接用浏览器打开 `index.html`。没有构建步骤。

## 下载后双击打开的独立版

```sh
python3 scripts/export-offline.py
```

会在 checkout 旁的 `Freddy-deliverables` 文件夹生成 `Kali-and-Little-Black-Offline.html`，其中包含小游戏、写实小狗、所有图片、样式和脚本。将这个单文件下载到自己的电脑，再用 Chrome、Edge 或 Safari 打开即可，不需要 Node.js、安装或服务器。底部按钮可以切换两个页面，完全断网也能玩。

独立版不能安装为手机 PWA；浏览器对本地文件存储的支持也可能不同。它仍然不是公网网址，不要把云机器里的文件路径当作可以发给朋友的访问链接。

## 小游戏

1. 回应宝宝的三次呼唤。
2. 点开四个可以付诸行动的小约定。
3. 打开道歉信，选择「给你一个抱抱」或「我还需要一点时间」。两种选择都有独立的回应，也可以返回重新选择。

结尾可以将完整的信下载成 UTF-8 文本。右上角可以手动开启轻柔互动音效，默认静音。支持键盘操作，并尊重系统的减少动态效果设置。

对话是故事里的模拟对话，不代表 Kali 的实际发言。网页没有后台、统计、登录或外部请求；她的选择不会发送、记录或上传。刷新页面会重新开始。

## 发给她

这是静态网站。将下面的文件保持相同目录结构，部署到 GitHub Pages 或其他静态托管服务后，即可把该服务生成的网址发给她：

```text
index.html
styles.css
app.js
assets/
  paw.svg
  little-black.svg
pet/
  index.html
  pet.css
  pet.js
  sw.js
  manifest.webmanifest
  icon.svg
  icon-192.png
  icon-512.png
  puppy-awake.png
  puppy-asleep.png
```

GitHub Pages 可以在 GitHub 仓库的 Settings → Pages 中选择已推送的分支及根目录。创建此页面并不代表已经推送或部署。

文案在 `index.html` 中；模拟对话、结尾回应和游戏逻辑在 `app.js` 中。

## 检查

```sh
npm run check
```

实际交互应在浏览器中检查：依次通过三关，打开信并检查两种结局、保存信件、重玩，以及窄屏布局。

## Kali 的小小狗窝

打开 `/pet/`，也可以从道歉页面底部进入。提供摸摸头、喂食、玩球、睡觉/起床、改名字、陪伴天数和最近三条相处记录。

- 状态只保存在当前浏览器的 `localStorage`，不需要账号，没有后台，也不上传数据。换设备、清除网站数据或浏览器禁止存储时，记录不会保留。
- 状态会随实际经过的时间缓慢变化，睡觉会恢复精力；离开时间再长也不会饿死、生病或失去小狗，没有签到任务。浏览器关闭时不运行后台进程，重新打开后根据经过的时间结算。
- 静态文件首次在线打开并成功缓存后，宠物页支持离线使用。正式部署需要 HTTPS；本机开发的 loopback 地址也可验证 Service Worker。
- iPhone 使用 Safari 的「分享 → 添加到主屏幕」；Android 使用 Chrome 菜单的「安装应用」或「添加到主屏幕」。这是可安装的网页应用（PWA），不是 APK，也不能悬浮在其他 App 上。
- 更新离线资源时需要同时修改 `pet/sw.js` 的缓存版本，确保手机能获取新样式和逻辑。

宠物的外观使用两张原创生成的写实小狗透明素材，配合光影、呼吸、互动动画和轻微透视产生 3D 质感，属于轻量的 2.5D 表现，并非可自由旋转的三维模型。醒着和睡着会切换成不同姿势；系统开启「减少动态效果」后停止动画。此次升级保持原有存档键不变，不重置名字和陪伴记录。

## 手机直接打开

工作区文件路径和预览图片都不是公网网址，手机无法通过这些路径访问网站。GitHub Pages 的设置入口是：

https://github.com/ziyangshen0510-star/Freddy/settings/pages

发布分支为 `gh-pages`、目录为 `/ (root)` 时，此仓库对应的标准站点地址是 `https://ziyangshen0510-star.github.io/Freddy/`，宠物页为 `https://ziyangshen0510-star.github.io/Freddy/pet/`。只有 GitHub 实际完成发布后才能访问，不能以推送成功代替网站上线验证。如果设置中没有可用的 Pages 功能，请检查 GitHub 账户对当前仓库的 Pages 支持。
